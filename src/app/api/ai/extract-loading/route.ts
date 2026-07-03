import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { customers } from '@/db/schema';
import { validateSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { parseViaPythonService, mapPythonResult } from '@/lib/table-parser-client';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const customerId = parseInt(String(formData.get('customerId') || '0'));
    const customerName = String(formData.get('customerName') || '');

    if (!file) return NextResponse.json({ error: '缺少上传文件' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = join('/tmp', `ld_${randomUUID()}.xlsx`);
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
): Promise<Record<string, number>> {
  if (customerId) {
    const cust = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (cust?.priceMatrix) {
      try { return JSON.parse(cust.priceMatrix); } catch {}
    }
  }
  const cName = customerName || (items || []).map((item: any) => item.客户).find((name: string) => name && name.trim());
  if (cName) {
    const cust = await db.select().from(customers).where(eq(customers.name, cName.trim())).get();
    if (cust?.priceMatrix) {
      try { return JSON.parse(cust.priceMatrix); } catch {}
    }
  }
  return {};
}

function applyPriceMatrix(items: any[], priceMatrix: Record<string, number>) {
  return (items || []).map((item: any) => {
    const mode = item.运输方式 === '海运' ? 'sea' : item.运输方式 === '陆运' ? 'land' : 'sea';
    const type = item.货型 === '普货' ? 'regular' : item.货型 === '商检货' ? 'inspection' : item.货型 === '敏货' ? 'sensitive' : 'regular';
    const totalVol = Number(item.总体积) || 0;
    const key = `${mode}_${type}`;
    const unitPrice = priceMatrix[key] || 0;
    const receivable = Math.round(unitPrice * totalVol * 100) / 100;
    return { ...item, 单价: unitPrice, 应收: receivable };
  });
}
