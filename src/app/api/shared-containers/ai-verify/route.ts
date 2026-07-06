import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { sharedContainerItems, marks, customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { aiChat } from '@/lib/ai';
import { eq, inArray } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const { batchId } = await request.json();

    const items = await db.select().from(sharedContainerItems)
      .where(eq(sharedContainerItems.batchId, batchId)).all();

    if (items.length === 0) {
      return NextResponse.json({ error: '批次无数据' }, { status: 400 });
    }

    const customerIds = [...new Set(items.map((i) => i.customerId))];
    const customerRecords = customerIds.length > 0
      ? await db.select().from(customers)
          .where(inArray(customers.id, customerIds)).all()
      : [];

    const customerNames = customerRecords.map(c => c.name).join(', ') || '未知客户';

    const itemsForAi = items.map((item, i) => ({
      序号: i + 1,
      itemId: item.id,
      品名: item.品名 || '-',
      体积: item.总体积,
      成本单价: item.成本单价_cents ? (item.成本单价_cents / 100).toFixed(2) : '未填',
      货型: item.货型 || '-',
      运输方式: item.运输方式 || '-',
    }));

    const systemPrompt = `你是一个货运财务系统的 AI 验价助手。你的任务是检查拼柜导入数据的合理性。

检查规则：
1. 成本单价是否明显异常（过高或过低，与市场行情对比）
2. 是否有缺失的关键字段（品名、体积、单价等）
3. 体积是否为合理的正数

对每条数据给出 verdict（"通过"或"异常"）和简要原因。

请以 JSON 格式返回：
{
  "overall": "全部通过" | "部分异常" | "全部异常",
  "details": [
    { "itemId": 数字, "verdict": "通过"|"异常", "reason": "原因说明" }
  ]
}`;

    const userPrompt = `客户：${customerNames}\n拼柜明细（共 ${itemsForAi.length} 条）：\n${JSON.stringify(itemsForAi, null, 2)}`;

    const aiResult = await aiChat(systemPrompt, userPrompt);

    let parsed;
    try {
      const jsonStart = aiResult.indexOf('{');
      const jsonEnd = aiResult.lastIndexOf('}');
      parsed = JSON.parse(aiResult.slice(jsonStart, jsonEnd + 1));
    } catch {
      return NextResponse.json({ error: 'AI 返回格式异常', raw: aiResult }, { status: 500 });
    }

    for (const detail of parsed.details || []) {
      const isAbnormal = detail.verdict === '异常';
      await db.update(sharedContainerItems)
        .set({
          ai_verified: isAbnormal ? 0 : 1,
          ai_verify_msg: isAbnormal ? detail.reason : null,
        })
        .where(eq(sharedContainerItems.id, detail.itemId));
    }

    return NextResponse.json({
      overall: parsed.overall,
      totalItems: items.length,
      abnormalCount: (parsed.details || []).filter((d: any) => d.verdict === '异常').length,
      details: parsed.details,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '验价失败' }, { status: 500 });
  }
}
