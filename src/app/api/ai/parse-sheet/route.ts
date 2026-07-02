import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { aiChat } from '@/lib/ai';

const SC_FIELDS = ['唛头号', '品名', '总体积', '成本单价', '货型', '运输方式'] as const;

const LD_FIELDS = [
  '唛头号', '品名', '尺寸_长', '尺寸_宽', '尺寸_高', '单箱体积',
  '总体积', '国内单号', '单箱数量', '总重量', '箱数', 'pcs数量',
  '货型', '运输方式',
] as const;

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  const { tableType, headers, sampleRows } = await request.json();

  if (!tableType || !headers || !sampleRows) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 });
  }

  const targetFields = tableType === 'shared-container' ? SC_FIELDS : LD_FIELDS;
  const tableLabel = tableType === 'shared-container' ? '拼柜表格' : '装柜清单';

  const sampleStr = sampleRows.map((row: unknown[], i: number) =>
    `第${i + 1}行: ${JSON.stringify(row)}`
  ).join('\n');

  const headerJson = JSON.stringify(headers);

  const systemPrompt = `你是一个物流表格数据专家。你需要识别原始Excel列名，映射到标准字段。

标准字段列表：${JSON.stringify(targetFields)}

规则：
1. 分析原始列名，找出与标准字段语义匹配的列。例如：
   - "唛头"、"唛头编号"、"Mark" → "唛头号"
   - "总体积"、"体积(m³)"、"体积"、"Volume" → "总体积"
   - "成本单价"、"单价" → "成本单价"
   - "尺寸_长"、"长(cm)"、"Long" → "尺寸_长"
   - "尺寸_宽"、"宽(cm)"、"Width" → "尺寸_宽"
   - "尺寸_高"、"高(cm)"、"Height" → "尺寸_高"
   - "货型"、"货物类型"、"Type" → "货型"
   - "运输方式"、"运输" → "运输方式"
   - "国内单号"、"单号" → "国内单号"
   - "单箱体积"、"每箱体积" → "单箱体积"
   - "单箱数量"、"数量" → "单箱数量"
   - "总重量"、"重量" → "总重量"
   - "箱数"、"件数" → "箱数"
   - "pcs数量"、"pcs"、"件" → "pcs数量"
2. 如果找不到匹配的列，fieldMapping中该字段值设为null
3. 列出所有无法匹配的原始列名到 unknownColumns
4. 列出缺失的标准字段到 warnings

返回纯 JSON（不要 markdown 代码块）：
{
  "fieldMapping": { "标准字段1": "原始列名A", "标准字段2": null, ... },
  "sampleData": [{ "标准字段1": "值", ... }], // 最多返回前 5 行
  "warnings": ["缺少"成本单价"列"],
  "unknownColumns": ["列X"]
}`;

  const userPrompt = `表格类型：${tableLabel}
原始列名：${headerJson}
原始数据（前${sampleRows.length}行）：
${sampleStr}`;

  try {
    const raw = await aiChat(systemPrompt, userPrompt);
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const result = JSON.parse(jsonStr);

    return NextResponse.json({
      fieldMapping: result.fieldMapping || {},
      sampleData: result.sampleData || [],
      warnings: result.warnings || [],
      unknownColumns: result.unknownColumns || [],
    });
  } catch (error) {
    return NextResponse.json({ error: 'AI 解析失败' }, { status: 500 });
  }
}
