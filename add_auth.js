const fs = require("fs");

["customers","direct-income","expenses","loading-batches","shared-containers"].forEach(name => {
  let fp = "src/app/api/" + name + "/route.ts";
  let s = fs.readFileSync(fp, "utf8");
  
  s = s.replace(
    "export async function GET() {",
    "export async function GET(request: NextRequest) {\n" +
    "  const st = request.cookies.get('session')?.value;\n" +
    "  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });\n" +
    "  const u = await validateSession(st);\n" +
    "  if (!u) return NextResponse.json({ error: '登录过期' }, { status: 401 });"
  );
  
  if (!s.includes("import { validateSession }")) {
    s = s.replace("import", "import { validateSession } from '@/lib/auth';\nimport");
  }
  if (!s.includes("import { NextRequest }")) {
    s = s.replace("import", "import { NextRequest } from 'next/server';\nimport");
  }
  
  fs.writeFileSync(fp, s);
  console.log(name, "OK");
});
