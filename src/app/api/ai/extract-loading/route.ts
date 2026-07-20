import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { parseViaPythonService, mapPythonResult } from '@/lib/table-parser-client';
import { cargoKey, isKnownCargo, isKnownTransport, waybillReceivable } from '@/lib/pricing';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const { fileName, fileData, customerId: cid, customerName: cname } = await request.json();
    const customerId = cid ? parseInt(String(cid), 10) : 0;
    const customerName = String(cname || '');
    if (!fileData) return NextResponse.json({ error: '缺少上传数据' }, { status: 400 });

    const buffer = Buffer.from(fileData, 'base64');
    const filePath = join('/tmp', `ld_${randomUUID()}_${fileName || 'upload.xlsx'}`);
    await writeFile(filePath, buffer);

    const pyData = await parseViaPythonService(filePath);
    const parsed = mapPythonResult(pyData);

    const priceMatrix = await loadPriceMatrix(customerId, customerName, parsed.items);
    const items = applyPriceMatrix(parsed.items, priceMatrix);

    return NextResponse.json({ items, summary: parsed.summary });
  } catch (error) {
    console.error('extract-loading Python 解析失败:', error);
    return NextResponse.json({ error: '表格解析失败，请重试' }, { status: 500 });
  }
}

async function loadPriceMatrix(
  customerId: number,
  customerName: string,
  items: any[],
): Promise<{ matrix: any; isThb: boolean; enableMinVol: boolean }> {
  const getCust = async (id: number) => {
    return await db.select().from(customers).where(eq(customers.id, id)).get();
  };
  const getCustByName = async (name: string) => {
    return await db.select().from(customers).where(eq(customers.name, name.trim())).get();
  };

  let cust = null;
  if (customerId) cust = await getCust(customerId);
  if (!cust) {
    const cName = customerName || (items || []).map((item: any) => item.客户).find((name: string) => name && name.trim());
    if (cName) cust = await getCustByName(cName);
  }

  if (!cust) return { matrix: {}, isThb: false, enableMinVol: true };

  const enableMinVol = cust.enableMinVolume !== 0;
  const isThb = cust.defaultCurrency === 'THB';
  if (isThb && cust.priceMatrixThb) {
    try { return { matrix: JSON.parse(cust.priceMatrixThb), isThb: true, enableMinVol }; } catch {}
  }
  if (cust.priceMatrix) {
    try { return { matrix: JSON.parse(cust.priceMatrix), isThb: false, enableMinVol }; } catch {}
  }
  return { matrix: {}, isThb: false, enableMinVol };
}

function applyPriceMatrix(items: any[], pm: { matrix: any; isThb: boolean; enableMinVol: boolean }) {
  const matrix = pm.matrix;
  const list = items || [];

  // 应收口径必须与"生成账单"完全一致：按运单分组，一个运单一笔，
  // 应收 = 客户价 × max(运单总体积, 低消保底 海0.5/陆0.3)，落在该运单第一条明细上、其余为0。
  const orderGroups = new Map<string, any[]>();
  list.forEach((item: any, idx: number) => {
    const ok = item.运单号 || `_${item.rowIndex ?? idx}`;
    if (!orderGroups.has(ok)) orderGroups.set(ok, []);
    orderGroups.get(ok)!.push(item);
  });

  const recvMap = new Map<any, number>();
  const warnMap = new Map<any, string>(); // 明细 → 报警原因

  for (const [, group] of orderGroups) {
    const first = group[0];
    const transport = first.运输方式 === '海运' ? 'sea' : first.运输方式 === '陆运' ? 'land' : 'sea';
    const warehouse = first.仓库 || null;
    const priceOf = (cargo: any): number => {
      const k = `${transport}_${cargoKey(cargo)}`;
      if (warehouse && matrix[warehouse] && typeof matrix[warehouse] === 'object' && typeof matrix[warehouse][k] === 'number') return matrix[warehouse][k];
      return typeof matrix[k] === 'number' ? matrix[k] : 0;
    };

    // 运单总体积：总体积字段是运单合计（前向填充/合并），取组内最大值即为合计
    let orderVol = 0;
    for (const it of group) orderVol = Math.max(orderVol, Number(it.总体积) || 0);

    const minVol = pm.enableMinVol ? (first.运输方式 === '陆运' ? 0.3 : 0.5) : 0;
    // 每条按自己货型定价后加总(一个运单里货型可能不同)，低消按比例放大
    const orderReceivable = waybillReceivable(group, priceOf, minVol);

    recvMap.set(first, orderReceivable);
    for (let i = 1; i < group.length; i++) recvMap.set(group[i], 0);

    // 取价不确定就报警，别闷头兜底乱套价
    const reasons: string[] = [];
    const badCargo = [...new Set(group.filter((it: any) => !isKnownCargo(it.货型)).map((it: any) => it.货型))];
    if (badCargo.length) reasons.push(`货型『${badCargo.join('/')}』无法识别，价格档位可能取错`);
    if (first.运输方式 && !isKnownTransport(first.运输方式)) reasons.push(`运输方式『${first.运输方式}』无法识别`);
    if (group.some((it: any) => priceOf(it.货型) === 0) && orderVol > 0) reasons.push('有货型未配价格');
    if (reasons.length) { for (const it of group) warnMap.set(it, reasons.join('；')); }
  }

  return list.map((item: any) => {
    const receivable = recvMap.get(item) ?? 0;
    const warn = warnMap.get(item);
    const verdict = warn ? '异常' : item.verdict || '通过';
    const reason = warn
      ? (item.reason ? item.reason + '；' + warn : warn)
      : item.reason || '';
    // 每条明细单独算单项应收
    const transKey = item.运输方式 === '海运' ? 'sea' : item.运输方式 === '陆运' ? 'land' : 'sea';
    const wh = item.仓库 || null;
    const k = transKey + '_' + cargoKey(item.货型);
    let itemPrice = 0;
    if (wh && matrix[wh] && typeof matrix[wh] === 'object' && typeof matrix[wh][k] === 'number') itemPrice = matrix[wh][k];
    else if (typeof matrix[k] === 'number') itemPrice = matrix[k];
    const itemRecv = Math.round(itemPrice * (Number(item.单项体积) || 0) * 100) / 100;
    return { ...item, 应收: receivable, 单项应收: itemRecv, verdict, reason };
  });
}
