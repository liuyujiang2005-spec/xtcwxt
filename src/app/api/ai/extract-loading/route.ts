import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { aiChat } from '@/lib/ai';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { rawRows, customerId, customerName } = await request.json();

  if (!rawRows || !Array.isArray(rawRows) || rawRows.length === 0) {
    return NextResponse.json({ error: '缺少 rawRows 或为空' }, { status: 400 });
  }

  const systemPrompt = `你是一个专业的装柜清单 Excel 数据提取助手。用户会提供一份装柜清单的原始 JSON 数据。

注意：原始数据是二维数组，第一行可能是表头，后续行是数据行，请根据内容自行识别列名和对应关系。列名可能是中文或英文。

## 任务

1. **识别列对应关系**：分析第一行（表头）中各列列名的含义，确定每个标准字段对应的列索引。后续每行是一个数组，按列索引提取数据。标准字段：
   - markNo：唛头号（可能的列名：唛头、唛头号、Mark、唛头编号）
   - 品名：货物名称（可能的列名：品名、名称、货物名称、货物品名、Item）
   - 客户：客户名称（可能的列名：客户、客户名称、客户名、Customer）
   - 尺寸_长：长，厘米（可能的列名：长、尺寸_长、长(cm)、Length、L）
   - 尺寸_宽：宽，厘米（可能的列名：宽、尺寸_宽、宽(cm)、Width、W）
   - 尺寸_高：高，厘米（可能的列名：高、尺寸_高、高(cm)、Height、H）
   - 单箱体积：每箱立方米（可能的列名：单箱体积、每箱体积、单箱CBM）
   - 总体积：立方米（可能的列名：总体积、体积、体积(m³)、Volume、CBM）
   - 成本单价：元（可能的列名：成本单价、单价、货值、成本运费单价、Price、Unit）
   - 国内单号：国内运单号（可能的列名：国内单号、单号、国内运单号、运单号）
   - 单箱数量：数字（可能的列名：单箱数量、数量、Qty、Quantity）
   - 总重量：kg（可能的列名：总重量、重量、重量kg、Weight）
   - 箱数：整数（可能的列名：箱数、件数、箱、CTN、Cartons）
   - pcs数量：整数（可能的列名：pcs数量、pcs、件数、PCS、Pieces）
   - 货型：货物类型（可能的列名：货型、货物类型、货物属性、Type、Category）
   - 运输方式：（可能的列名：运输方式、运输、物流方式、Mode）
   - 需支付总价：（可能的列名：总价、需支付总价、货值、总金额、Total、Amount）
   - 结算状态：（可能的列名：结算状态、状态、付款状态、Status）

   特殊处理：
   - 如果尺寸在一个单元格里（如 "55×33×26" 或 "553326"），分别解析为长/宽/高。连续数字无分隔符时按以下规则拆分：3位×3位×2位（如 553326→55×33×26），或 2位×2位×2位（如 403050→40×30×50）
   - 如果只有"箱数"没有"单箱数量"和"pcs数量"，则 单箱数量=1，pcs数量=箱数

2. **提取数据**：对数据行（跳过表头行），按列索引提取对应值，返回如下格式：
   \`\`\`json
   {
     "rowIndex": 行号（从1开始）,
     "markNo": "提取的唛头号",
     "品名": "提取的品名",
     "客户": "提取的客户名称",
     "尺寸_长": 数字（缺失填 0）,
     "尺寸_宽": 数字（缺失填 0）,
     "尺寸_高": 数字（缺失填 0）,
     "单箱体积": 数字,
     "总体积": 数字,
     "成本单价": 数字（缺失填 0）,
     "国内单号": "字符串",
     "单箱数量": 整数,
     "总重量": 数字,
     "箱数": 整数,
     "pcs数量": 整数,
     "货型": "普货"|"商检货"|"敏货"|"特货"|"",
     "运输方式": "海运"|"陆运"|"空运"|"",
     "需支付总价": 数字,
     "结算状态": "字符串",
     "verdict": "通过"|"异常",
     "reason": "异常原因（通过时为空字符串）"
   }
   \`\`\`

3. **验价规则**（按优先级判断，取第一条命中的异常）：
   a. 唛头号为空 → verdict:"异常", reason:"缺少唛头号"
   b. 总体积 <= 0 → verdict:"异常", reason:"体积无效（≤0）"
   c. 以上都不触发 → verdict:"通过", reason:""

4. **汇总**：统计所有行，返回 summary

## 返回格式

严格按以下 JSON 返回（不要 markdown 代码块包裹）：

{
  "items": [{ "rowIndex": 1, "markNo": "...", "客户": "...", "成本单价": 0, "需支付总价": 0, "结算状态": "", ... "verdict": "通过", "reason": "" }, ...],
  "summary": { "totalItems": 0, "abnormalCount": 0 }
}

注意：货型统一标准化为：普货、商检货、敏货、特货。运输方式统一：海运、陆运、空运。数字字段转为 number 类型。`;

  const userPrompt = `总行数：${rawRows.length}（第一行为表头，剩余 ${rawRows.length - 1} 行为数据行）
完整数据：
${JSON.stringify(rawRows)}

请返回完整的 items 数组（所有数据行）和 summary。`;

  let raw = '';
  try {
    raw = await aiChat(systemPrompt, userPrompt);
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const data = JSON.parse(jsonStr);

    // 优先用传进来的 customerId 查 priceMatrix，其次从 AI 提取的客户名匹配
    let priceMatrix: Record<string, number> = {};
    if (customerId) {
      const cust = await db.select().from(customers).where(eq(customers.id, customerId)).get();
      if (cust?.priceMatrix) {
        try { priceMatrix = JSON.parse(cust.priceMatrix); } catch {}
      }
    }
    if (Object.keys(priceMatrix).length === 0) {
      const cName = customerName || (data.items || [])
        .map((item: any) => item.客户)
        .find((name: string) => name && name.trim());
      if (cName) {
        const cust = await db.select().from(customers)
          .where(eq(customers.name, cName.trim()))
          .get();
        if (cust?.priceMatrix) {
          try { priceMatrix = JSON.parse(cust.priceMatrix); } catch {}
        }
      }
    }

    const items = (data.items || []).map((item: any) => {
      const mode = item.运输方式 === '海运' ? 'sea' : item.运输方式 === '陆运' ? 'land' : 'sea';
      const type = item.货型 === '普货' ? 'regular' : item.货型 === '商检货' ? 'inspection' : item.货型 === '敏货' ? 'sensitive' : 'regular';
      const totalVol = Number(item.总体积) || 0;

      const key = `${mode}_${type}`;
      const unitPrice = priceMatrix[key] || 0;
      const receivable = Math.round(unitPrice * totalVol * 100) / 100;

      return {
        ...item,
        单价: unitPrice,
        应收: receivable,
      };
    });

    return NextResponse.json({
      items,
      summary: data.summary || { totalItems: 0, abnormalCount: 0 },
    });
  } catch (error) {
    console.error('extract-loading 解析失败:', error);
    console.log('AI原始响应:', JSON.stringify(raw).slice(0, 2000));

    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace === -1) throw new Error('无可恢复的截断点');

      let recovered = cleaned.substring(0, lastBrace + 1);

      let data: any;
      try {
        data = JSON.parse(recovered);
      } catch {
        recovered += ']}';
        data = JSON.parse(recovered);
      }

      let priceMatrix: Record<string, number> = {};
      if (customerId) {
        const cust = await db.select().from(customers).where(eq(customers.id, customerId)).get();
        if (cust?.priceMatrix) {
          try { priceMatrix = JSON.parse(cust.priceMatrix); } catch {}
        }
      }
      if (Object.keys(priceMatrix).length === 0) {
        const cName = customerName || (data.items || [])
          .map((item: any) => item.客户)
          .find((name: string) => name && name.trim());
        if (cName) {
          const cust = await db.select().from(customers)
            .where(eq(customers.name, cName.trim()))
            .get();
          if (cust?.priceMatrix) {
            try { priceMatrix = JSON.parse(cust.priceMatrix); } catch {}
          }
        }
      }

      const items = (data.items || []).map((item: any) => {
        const mode = item.运输方式 === '海运' ? 'sea' : item.运输方式 === '陆运' ? 'land' : 'sea';
        const type = item.货型 === '普货' ? 'regular' : item.货型 === '商检货' ? 'inspection' : item.货型 === '敏货' ? 'sensitive' : 'regular';
        const totalVol = Number(item.总体积) || 0;
        const key = `${mode}_${type}`;
        const unitPrice = priceMatrix[key] || 0;
        const receivable = Math.round(unitPrice * totalVol * 100) / 100;
        return { ...item, 单价: unitPrice, 应收: receivable };
      });

      console.log('截断修复成功，恢复条数:', data.items?.length || 0);
      return NextResponse.json({ items, summary: data.summary || { totalItems: 0, abnormalCount: 0 } });
    } catch {
      console.error('截断修复也失败');
      return NextResponse.json({ error: 'AI 解析失败，请重试' }, { status: 500 });
    }
  }
}
