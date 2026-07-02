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

  const rowSample = rawRows.slice(0, 5).map((row: unknown, i: number) =>
    `第${i + 1}行: ${JSON.stringify(row)}`
  ).join('\n');

  const systemPrompt = `你是一个专业的物流拼柜 Excel 数据提取 + 验价助手。用户会提供一份拼柜表格的原始 JSON 行数据，列名可能是中文或英文。

## 任务

1. **识别列对应关系**：分析每行的 key（列名），映射到以下标准字段：
   - markNo：唛头号（可能的列名：唛头、唛头号、Mark、唛头编号）
   - 品名：货物名称（可能的列名：品名、货物名称、货物品名、Item）
   - 总体积：立方米（可能的列名：总体积、体积、体积(m³)、Volume、CBM）
   - 成本单价：元（可能的列名：成本单价、单价、成本运费单价、Price、Unit）
   - 货型：货物类型（可能的列名：货型、货物类型、货物属性、Type、Category）
   - 运输方式：（可能的列名：运输方式、运输、物流方式、Mode）
   - 总价/需支付总价：（可能的列名：总价、需支付总价、总金额、Total、Amount）用于验价

2. **提取数据**：对每一行数据，按上一步识别的列名提取对应值，返回如下格式：
   \`\`\`json
   {
     "rowIndex": 行号（从1开始）,
     "markNo": "提取的唛头号（没有则为空字符串）",
     "品名": "提取的品名",
     "总体积": 数字（缺失或无效填 0）,
     "成本单价": 数字（缺失或无效填 0）,
     "货型": "普货"|"商检货"|"敏货"|"特货"|"",
     "运输方式": "海运"|"陆运"|"空运"|"",
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
    { "rowIndex": 1, "markNo": "...", "品名": "...", "总体积": 0, "成本单价": 0, "货型": "...", "运输方式": "...", "verdict": "通过", "reason": "" },
    ...
  ],
  "summary": { "totalItems": 0, "abnormalCount": 0 }
}

注意：货型如果原文是"普货/商检/敏货"之类的，统一标准化为：普货、商检货、敏货、特货。
运输方式原文化：海运/陆运/空运。
体积和单价都转为数字类型。`;

  const userPrompt = `客户：${customerName || '未知'}
总行数：${rawRows.length}
原始数据（前5行样本）：
${rowSample}

剩余 ${rawRows.length - 5} 行格式相同，请同样提取。请返回完整的 items 数组（所有行）和 summary。`;

  try {
    const raw = await aiChat(systemPrompt, userPrompt);
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const data = JSON.parse(jsonStr);

    return NextResponse.json({
      items: data.items || [],
      summary: data.summary || { totalItems: 0, abnormalCount: 0 },
    });
  } catch (error) {
    return NextResponse.json({ error: 'AI 解析失败，请重试' }, { status: 500 });
  }
}
