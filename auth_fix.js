const fs = require("fs");

["customers","direct-income","expenses","loading-batches","shared-containers"].forEach(name => {
  const fp = "src/app/api/" + name + "/route.ts";
  let src = fs.readFileSync(fp, "utf8");

  // Ensure NextRequest import exists in the existing NextResponse import
  if (!src.includes("NextRequest")) {
    src = src.replace(
      "import { NextResponse } from 'next/server'",
      "import { NextRequest, NextResponse } from 'next/server'"
    );
  }

  // Ensure validateSession import exists  
  if (!src.includes("import { validateSession }")) {
    const importLine = "import { validateSession } from '@/lib/auth';";
    // Insert after the last import line
    const lines = src.split("\n");
    let lastImportIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("import ")) lastImportIdx = i;
    }
    lines.splice(lastImportIdx + 1, 0, importLine);
    src = lines.join("\n");
  }

  // Replace GET handler with authenticated version
  src = src.replace(
    "export async function GET() {",
    "export async function GET(request: NextRequest) {\n" +
    "  const st = request.cookies.get('session')?.value;\n" +
    "  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });\n" +
    "  const u = await validateSession(st);\n" +
    "  if (!u) return NextResponse.json({ error: '登录过期' }, { status: 401 });"
  );

  fs.writeFileSync(fp, src);
  console.log(name, "OK");
});
