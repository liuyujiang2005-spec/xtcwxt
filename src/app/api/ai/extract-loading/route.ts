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

  let priceMatrix: Record<string, number> = {};
  if (customerId) {
    const cust = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (cust?.priceMatrix) {
      try { priceMatrix = JSON.parse(cust.priceMatrix); } catch {}
    }
  }

  const rowSample = rawRows.slice(0, 5).map((row: unknown, i: number) =>
    `第${i + 1}行: ${JSON.stringify(row)}`
  ).join('\n');

  const systemPrompt = `你是一个专业的装柜清单 Excel 数据提取助手。用户会提供一份装柜清单的原始 JSON 行数据，列名可能是中文或英文。

## 任务

1. **识别列对应关系**：分析每行的 key（列名），映射到以下标准字段：
   - markNo：唛头号（可能的列名：唛头、唛头号、Mark、唛头编号）
   - 品名：货物名称（可能的列名：品名、货物名称、货物品名、Item）
   - 尺寸_长：长，厘米（可能的列名：长、尺寸_长、长(cm)、Length、L）
   - 尺寸_宽：宽，厘米（可能的列名：宽、尺寸_宽、宽(cm)、Width、W）
   - 尺寸_高：高，厘米（可能的列名：高、尺寸_高、高(cm)、Height、H）
   - 单箱体积：每箱立方米（可能的列名：单箱体积、每箱体积、单箱CBM）
   - 总体积：立方米（可能的列名：总体积、体积、体积(m³)、Volume、CBM）
   - 国内单号：国内运单号（可能的列名：国内单号、单号、国内运单号、运单号）
   - 单箱数量：数字（可能的列名：单箱数量、数量、Qty、Quantity）
   - 总重量：kg（可能的列名：总重量、重量、重量kg、Weight）
   - 箱数：整数（可能的列名：箱数、件数、箱、CTN、Cartons）
   - pcs数量：整数（可能的列名：pcs数量、pcs、件数、PCS、Pieces）
   - 货型：货物类型（可能的列名：货型、货物类型、货物属性、Type、Category）
   - 运输方式：（可能的列名：运输方式、运输、物流方式、Mode）

   特殊处理：
   - 如果尺寸在一个单元格里（如 "55×33×26" 或 "553326"），分别解析为长/宽/高。连续数字无分隔符时按以下规则拆分：3位×3位×2位（如 553326→55×33×26），或 2位×2位×2位（如 403050→40×30×50）
   - 如果只有"箱数"没有"单箱数量"和"pcs数量"，则 单箱数量=1，pcs数量=箱数
   - 如果表格中有"总重量"无"单箱重量"，总重量/箱数=单箱重量（忽略此项，不影响提取）

2. **提取数据**：对每一行，按识别的列名提取值，返回如下格式：
   \`\`\`json
   {
     "rowIndex": 行号（从1开始）,
     "markNo": "提取的唛头号",
     "品名": "提取的品名",
     "尺寸_长": 数字（缺失填 0）,
     "尺寸_宽": 数字（缺失填 0）,
     "尺寸_高": 数字（缺失填 0）,
     "单箱体积": 数字,
     "总体积": 数字,
     "国内单号": "字符串",
     "单箱数量": 整数,
     "总重量": 数字,
     "箱数": 整数,
     "pcs数量": 整数,
     "货型": "普货"|"商检货"|"敏货"|"特货"|"",
     "运输方式": "海运"|"陆运"|"空运"|"",
     "verdict": "通过"|"异常",
     "reason": "异常原因（通过时为空字符串）"
   }
   \`\`\`

3. **验价规则**（按优先级判断，取第一条命中的异常）：
   a. 唛头号为空 → verdict:"异常", reason:"缺少唛头号"
   b. 品名为空 → verdict:"异常", reason:"缺少品名"
   c. 总体积 <= 0 → verdict:"异常", reason:"体积无效（≤0）"
   d. 运输方式不在 ["海运","陆运","空运"] 中 → verdict:"异常", reason:"运输方式无法识别"
   e. 货型不在 ["普货","商检货","敏货","特货"] 中 → verdict:"异常", reason:"货型无法识别"
   f. 以上都不触发 → verdict:"通过", reason:""

4. **汇总**：统计所有行，返回 summary

## 返回格式

严格按以下 JSON 返回（不要 markdown 代码块包裹）：

{
  "items": [{ "rowIndex": 1, "markNo": "...", ... "verdict": "通过", "reason": "" }, ...],
  "summary": { "totalItems": 0, "abnormalCount": 0 }
}

注意：货型统一标准化为：普货、商检货、敏货、特货。运输方式统一：海运、陆运、空运。数字字段转为 number 类型。`;

  const userPrompt = `客户：${customerName || '未知'}
总行数：${rawRows.length}
原始数据（前5行样本）：
${rowSample}

剩余 ${rawRows.length - 5} 行格式相同，请同样提取。返回完整的 items 数组（所有行）和 summary。`;

  try {
    const raw = await aiChat(systemPrompt, userPrompt);
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const data = JSON.parse(jsonStr);

    // 根据客户 price_matrix 自动匹配单价和计算应收
    const items = (data.items || []).map((item: any) => {
      const mode = item.运输方式 === '海运' ? 'sea' : item.运输方式 === '陆运' ? 'land' : null;
      const type = item.货型 === '普货' ? 'regular' : item.货型 === '商检货' ? 'inspection' : item.货型 === '敏货' ? 'sensitive' : null;
      const totalVol = Number(item.总体积) || 0;

      let unitPrice = 0;
      let receivable = 0;

      if (mode && type) {
        const key = `${mode}_${type}`;
        unitPrice = priceMatrix[key] || 0;
        receivable = Math.round(unitPrice * totalVol * 100) / 100;
      }

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
    return NextResponse.json({ error: 'AI 解析失败，请重试' }, { status: 500 });
  }
}
