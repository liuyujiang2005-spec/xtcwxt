import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { validateSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  if (!sessionToken) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const user = await validateSession(sessionToken);
  if (!user) return NextResponse.json({ error: '登录过期' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: '缺少文件' }, { status: 400 });

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) return NextResponse.json({ error: '文件不能超过10MB' }, { status: 400 });

    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'application/pdf'];
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: '仅支持图片和PDF文件' }, { status: 400 });

    const uploadDir = join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    const extMap: Record<string, string> = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
      'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf',
    };
    const ext = extMap[file.type] || 'bin';
    const fileName = `receipt_${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(uploadDir, fileName), buffer);

    const url = `/uploads/${fileName}`;
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: '上传失败' }, { status: 500 });
  }
}
