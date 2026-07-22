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

    // AI 只做一件事:软性判断"成本单价"(元/方的费率)本身是否离谱。
    // 只发单价+货型+运输,不发体积/总价,AI 物理上无法做 单价×体积=总价 之类交叉校验(那类误报根源在此)。
    // 数据自洽/缺字段/体积等硬错误由前端确定性自检(verifyItem)负责,不劳AI。AI结果在前端只标"提示"不标"异常"。
    const systemPrompt = `你是货运财务系统的验价助手。你只判断每条明细的"成本单价"(元/方的物流费率)本身是否可疑：
- 为0或为空
- 明显偏离该货型正常物流费率（过高或过低，像手误多打/少打了一位数）
只看单价数值本身，结合货型和运输方式判断。不要用其它字段推算，也没有给你体积和总价（这是刻意的）。
只返回可疑项，正常的不返回；全部正常返回空数组。
返回JSON：{"abnormal":[{"itemId":数字,"reason":"简短原因，如：成本单价5500疑似偏高（普货海运通常几百元/方）"}]}`;

    const allAbnormal: { itemId: number; reason: string }[] = [];

    for (const batch of batches) {
      const batchItems = batch.flatMap(g => g);
      // 只发单价+货型+运输(+品名),不发体积/总价 → AI 无从交叉校验
      const itemsForAi = batchItems.map(({ originalIndex, item }) => ({
        itemId: originalIndex,
        品名: item.品名 || '-',
        货型: item.货型 || '-',
        运输方式: item.运输方式 || '-',
        成本单价: item.成本单价 ?? item.单价 ?? '-',
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
