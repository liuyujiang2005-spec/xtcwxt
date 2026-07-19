import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { parseViaPythonService, mapPythonResult } from '@/lib/table-parser-client';

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
): Promise<{ matrix: any; isThb: boolean }> {
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

  if (!cust) return { matrix: {}, isThb: false };

  const isThb = cust.defaultCurrency === 'THB';
  if (isThb && cust.priceMatrixThb) {
    try { return { matrix: JSON.parse(cust.priceMatrixThb), isThb: true }; } catch {}
  }
  if (cust.priceMatrix) {
    try { return { matrix: JSON.parse(cust.priceMatrix), isThb: false }; } catch {}
  }
  return { matrix: {}, isThb: false };
}

function applyPriceMatrix(items: any[], pm: { matrix: any; isThb: boolean }) {
  const matrix = pm.matrix;
  return (items || []).map((item: any) => {
    const transport = item.运输方式 === '海运' ? 'sea' : item.运输方式 === '陆运' ? 'land' : 'sea';
    const cargo = item.货型 || '';
    const type = cargo === '普货' ? 'regular' : cargo === '商检货' ? 'inspection' : 'sensitive';
    const key = `${transport}_${type}`;
    const warehouse = item.仓库 || null;

    let matrixPrice = 0;
    if (warehouse && matrix[warehouse] && typeof matrix[warehouse] === 'object' && typeof matrix[warehouse][key] === 'number') {
      matrixPrice = matrix[warehouse][key];
    } else if (typeof matrix[key] === 'number') {
      matrixPrice = matrix[key];
    }

    const totalVol = Number(item.总体积) || 0;
    const receivable = matrixPrice * totalVol;
    const verdict = matrixPrice === 0 && totalVol > 0 ? '异常' : item.verdict || '通过';
    const reason = matrixPrice === 0 && totalVol > 0
      ? (item.reason ? item.reason + '；未配价格' : '未配价格')
      : item.reason || '';
    return { ...item, 应收: receivable, verdict, reason };
  });
}
