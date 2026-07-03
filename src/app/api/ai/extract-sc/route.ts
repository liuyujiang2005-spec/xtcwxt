import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { aiChat } from '@/lib/ai';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { rawRows, customerName } = await request.json();

  if (!rawRows || !Array.isArray(rawRows) || rawRows.length === 0) {
    return NextResponse.json({ error: '缺少 rawRows 或为空' }, { status: 400 });
  }

  const systemPrompt = `你是一个专业的物流拼柜 Excel 数据提取 + 验价助手。用户会提供一份拼柜表格的原始 JSON 数据。

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
   - 成本单价：元（可能的列名：成本单价、单价、成本运费单价、Price、Unit）
   - 国内单号：国内运单号（可能的列名：国内单号、单号、国内运单号、运单号）
   - 单箱数量：数字（可能的列名：单箱数量、数量、Qty、Quantity）
   - 总重量：kg（可能的列名：总重量、重量、重量kg、Weight）
   - 箱数：整数（可能的列名：箱数、件数、箱、CTN、Cartons）
   - pcs数量：整数（可能的列名：pcs数量、pcs、件数、PCS、Pieces）
   - 货型：货物类型（可能的列名：货型、货物类型、货物属性、Type、Category）
   - 运输方式：（可能的列名：运输方式、运输、物流方式、Mode）
   - 需支付总价：（可能的列名：总价、需支付总价、总金额、Total、Amount）
   - 结算状态：（可能的列名：结算状态、状态、付款状态、Status）

   尺寸可能在一个单元格里（如 "55×33×26" 或 "553326"），需要解析成长宽高三个数字。连续数字无分隔符时按 3位×3位×2位 或 2位×2位×2位 拆分。

2. **提取数据**：对数据行（跳过表头行），按列索引提取对应值，返回如下格式：
   \`\`\`json
   {
      "rowIndex": 行号（从1开始）,
      "markNo": "提取的唛头号（没有则为空字符串）",
      "品名": "提取的品名",
      "客户": "提取的客户名称",
      "尺寸_长": 数字（缺失填 0）,
     "尺寸_宽": 数字（缺失填 0）,
     "尺寸_高": 数字（缺失填 0）,
     "单箱体积": 数字,
     "总体积": 数字（缺失或无效填 0）,
     "成本单价": 数字（缺失或无效填 0）,
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
   a. 如果体积 <= 0 → verdict:"异常", reason:"体积无效（≤0）"
   b. 如果成本单价 <= 0 → verdict:"异常", reason:"成本单价无效（≤0）"  
   c. 如果唛头号为空 → verdict:"异常", reason:"缺少唛头号"
   d. 如果品名为空 → verdict:"异常", reason:"缺少品名"
   e. 如果货型不在 ["普货","商检货","敏货","特货"] 中 → verdict:"异常", reason:"货型无法识别"
   f. 如果运输方式不在 ["海运","陆运","空运"] 中 → verdict:"异常", reason:"运输方式无法识别"
   g. 如果表格中存在"总价"列：计算 总价 ≈ 成本单价 × 总体积（允许舍入误差 ±1），如果差异过大（>总价的5% 或 >5元）→ verdict:"异常", reason:"总价与单价×体积不匹配（表格总价=X，计算值=Y）"
   h. 以上都不触发 → verdict:"通过", reason:""

4. **汇总**：统计所有行，返回 summary

## 返回格式

严格按以下 JSON 返回（不要 markdown 代码块包裹，直接返回纯 JSON）：

{
  "items": [
    { "rowIndex": 1, "markNo": "...", "品名": "...", "客户": "...", "尺寸_长": 0, "尺寸_宽": 0, "尺寸_高": 0, "单箱体积": 0, "总体积": 0, "成本单价": 0, "国内单号": "", "单箱数量": 0, "总重量": 0, "箱数": 0, "pcs数量": 0, "货型": "...", "运输方式": "...", "需支付总价": 0, "结算状态": "", "verdict": "通过", "reason": "" },
    ...
  ],
  "summary": { "totalItems": 0, "abnormalCount": 0 }
}

注意：货型如果原文是"普货/商检/敏货"之类的，统一标准化为：普货、商检货、敏货、特货。
运输方式原文化：海运/陆运/空运。
尺寸可能在一个单元格里（如 55×33×26），需要解析成长宽高三个数字。
体积、单价、尺寸等数字字段都转为数字类型。`;

  const userPrompt = `客户：${customerName || '未知'}
总行数：${rawRows.length}（第一行为表头，剩余 ${rawRows.length - 1} 行为数据行）
完整数据：
${JSON.stringify(rawRows)}

请返回完整的 items 数组（所有数据行）和 summary。`;

  let raw = '';
  try {
    raw = await aiChat(systemPrompt, userPrompt);
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const data = JSON.parse(jsonStr);

    return NextResponse.json({
      items: data.items || [],
      summary: data.summary || { totalItems: 0, abnormalCount: 0 },
    });
  } catch (error) {
    console.error('extract-sc 解析失败:', error);
    console.log('AI原始响应:', JSON.stringify(raw).slice(0, 2000));

    // 截断修复：从最后一个 } 截断，补上缺失的闭合符
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

      console.log('截断修复成功，恢复条数:', data.items?.length || 0);
      return NextResponse.json({
        items: data.items || [],
        summary: data.summary || { totalItems: 0, abnormalCount: 0 },
      });
    } catch {
      console.error('截断修复也失败');
      return NextResponse.json({ error: 'AI 解析失败，请重试' }, { status: 500 });
    }
  }
}
