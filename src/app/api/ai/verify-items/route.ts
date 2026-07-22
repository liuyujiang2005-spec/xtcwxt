import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { aiChat } from '@/lib/ai';

const MAX_ITEMS_PER_BATCH = 400;
const MAX_GROUPS_PER_BATCH = 50;

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const { items, type = 'shared-container' } = await request.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '缺少数据' }, { status: 400 });
    }

    const isSc = type === 'shared-container';

    const groups = new Map<string, { originalIndex: number; item: any }[]>();
    items.forEach((item: any, idx: number) => {
      const key = item.运单号 || `_row_${idx}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ originalIndex: idx, item });
    });

    const batches: { originalIndex: number; item: any }[][][] = [];
    let currentBatch: { originalIndex: number; item: any }[][] = [];
    let currentItemCount = 0;

    for (const group of groups.values()) {
      if (currentBatch.length >= MAX_GROUPS_PER_BATCH || currentItemCount + group.length > MAX_ITEMS_PER_BATCH) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentItemCount = 0;
        }
      }
      currentBatch.push(group);
      currentItemCount += group.length;
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    const systemPrompt = isSc
      ? `你是一个货运财务系统的 AI 验价助手。检查拼柜导入数据的合理性。
检查规则：
1. 成本单价是否明显异常（过高或过低，与市场行情对比）
2. 是否有缺失的关键字段（品名、体积、单价等）
3. 体积是否为合理的正数
4. 同一运单内的明细汇总是否合理
只返回异常项，通过的不需要返回。如果全部通过，返回空数组。
返回JSON：{"abnormal":[{"itemId":数字,"reason":"原因说明"}]}`
      : `你是一个货运财务系统的 AI 验价助手。检查装柜导入数据的合理性。
请注意：发给你的"单价"是成本计费单价（元/方，付给供应商的费率），真正的成本 = 单价 × 计费体积；"应收"是向客户收的钱（按运单计算：客户价 × max(运单总体积, 低消保底)，落在运单第一条、其余为0）。单价是成本口径、应收是客户口径，两者基准完全不同，绝对不要交叉校验（不要用单价推算应收，也不要用应收推算单价，也不要用应收÷体积去判断是否合理——低消保底会让小体积运单的应收偏大，属正常）。
检查规则：
1. 成本单价（元/方的费率）是否明显异常（为0、为空、或远超出正常物流每方单价的合理范围）
2. 体积是否为合理的正数
3. 是否有缺失的关键字段（品名、体积、单价等）
4. 同一运单内的明细汇总是否合理
只返回异常项，通过的不需要返回。如果全部通过，返回空数组。
返回JSON：{"abnormal":[{"itemId":数字,"reason":"原因说明"}]}`;

    const allAbnormal: { itemId: number; reason: string }[] = [];

    for (const batch of batches) {
      const batchItems = batch.flatMap(g => g);
      const itemsForAi = batchItems.map(({ originalIndex, item }) => ({
        itemId: originalIndex,
        品名: item.品名 || '-',
         体积: item.计费体积 ?? item.单项体积 ?? item.总体积 ?? item.体积 ?? '-',
        货型: item.货型 || '-',
        运输方式: item.运输方式 || '-',
        ...(isSc
          ? { 成本单价: item.成本单价 ?? item.单价 ?? '-', 需支付总价: item.需支付总价 ?? item.单项价格 ?? '-' }
          : { 单价: item.单价 ?? item.单价 ?? '-', 应收: item.应收 ?? item.需支付总价 ?? item.单项价格 ?? '-' }
        ),
      }));

      const userPrompt = `以下是要检查的${isSc ? '拼柜' : '装柜'}明细（共 ${itemsForAi.length} 条）：\n${JSON.stringify(itemsForAi, null, 2)}`;

      try {
        const aiResult = await aiChat(systemPrompt, userPrompt);
        const parsed = safeParseJson(aiResult);
        if (parsed?.abnormal && Array.isArray(parsed.abnormal)) {
          for (const a of parsed.abnormal) {
            if (typeof a.itemId === 'number' && typeof a.reason === 'string') {
              allAbnormal.push({ itemId: a.itemId, reason: a.reason });
            }
          }
        }
      } catch (err) {
        console.error('批次验价失败:', err);
      }
    }

    const overall = allAbnormal.length === 0 ? '全部通过' : allAbnormal.length === items.length ? '全部异常' : '部分异常';

    return NextResponse.json({
      overall,
      totalItems: items.length,
      abnormalCount: allAbnormal.length,
      batchCount: batches.length,
      details: allAbnormal,
    });
  } catch (error: any) {
    console.error('验价失败:', error);
    return NextResponse.json({ error: '验价失败' }, { status: 500 });
  }
}

function safeParseJson(raw: string): any | null {
  // 去掉 markdown 代码块标记
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // 找到最外层 JSON 对象/数组
  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  let start = -1;
  let isArray = false;
  if (objStart === -1 && arrStart === -1) return null;
  if (arrStart !== -1 && (arrStart < objStart || objStart === -1)) {
    start = arrStart;
    isArray = true;
  } else {
    start = objStart;
  }
  const endChar = isArray ? ']' : '}';
  const end = cleaned.lastIndexOf(endChar);
  if (start === -1 || end === -1 || end <= start) return null;

  let jsonStr = cleaned.slice(start, end + 1);

  // 尝试直接解析
  try { return JSON.parse(jsonStr); } catch {}

  // 去掉尾逗号后再试
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(jsonStr); } catch {}

  return null;
}
