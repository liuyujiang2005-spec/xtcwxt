import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { parseViaPythonService, mapPythonResult } from '@/lib/table-parser-client';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user || user.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '缺少上传文件' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = join('/tmp', `sc_${randomUUID()}.xlsx`);
    await writeFile(filePath, buffer);

    const pyData = await parseViaPythonService(filePath);
    const result = mapPythonResult(pyData);
    return NextResponse.json(result);
  } catch (error) {
    console.error('extract-sc Python 解析失败:', error);
    return NextResponse.json({ error: '表格解析失败，请重试' }, { status: 500 });
  }
}
