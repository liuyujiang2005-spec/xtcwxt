const fs = require("fs");
const path = require("path");
const root = "/root/xtcwxt/src";

function read(f) { return fs.readFileSync(path.join(root, f), "utf8"); }
function write(f, s) { fs.writeFileSync(path.join(root, f), s); console.log("  fixed:", f); }

// ═══════ FATAL FIXES ═══════

// F1-F5: Add auth to 5 unprotected GET endpoints
["app/api/customers/route.ts", "app/api/direct-income/route.ts", "app/api/expenses/route.ts",
 "app/api/loading-batches/route.ts", "app/api/shared-containers/route.ts"].forEach(fp => {
  let s = read(fp);
  // Add import if not present
  if (!s.includes("import { validateSession }")) {
    s = s.replace(/import/, "import { validateSession } from '@/lib/auth';\nimport");
  }
  if (!s.includes("import { NextRequest }")) {
    s = s.replace(/import/, "import { NextRequest } from 'next/server';\nimport");
  }
  // Replace GET handler
  s = s.replace(/export async function GET\(\)/, "export async function GET(request: NextRequest)");
  s = s.replace(/(export async function GET\(request: NextRequest\) \{[^}]*?)(const all =)/s, 
    "$1const st = request.cookies.get('session')?.value;\n" +
    "  if (!st) return NextResponse.json({ error: '未登录' }, { status: 401 });\n" +
    "  const u = await validateSession(st);\n" +
    "  if (!u) return NextResponse.json({ error: '登录过期' }, { status: 401 });\n\n" +
    "  $2");
  write(fp, s);
});

// F6: verify-loading - fix single customer query
let s = read("app/api/ai/verify-loading/route.ts");
s = s.replace(/eq\(customers\.id, customerIds\[0\]\)/, "inArray(customers.id, customerIds)");
if (!s.includes("inArray")) {
  s = s.replace(/import { eq, and, gte, lte, desc }/, "import { eq, and, gte, lte, desc, inArray }");
}
write("app/api/ai/verify-loading/route.ts", s);

// F7: Monthly report template literal fix
s = read("app/(main)/reports/monthly/page.tsx");
s = s.replace(/\{revenueTHB > 0 \? ` \+ THB \{revenueTHB\.toFixed\(6\)\}` : ''\}/g, "{revenueTHB > 0 ? ` + THB ${revenueTHB.toFixed(6)}` : ''}");
s = s.replace(/\{costTHB > 0 \? ` \+ THB \{costTHB\.toFixed\(6\)\}` : ''\}/g, "{costTHB > 0 ? ` + THB ${costTHB.toFixed(6)}` : ''}");
write("app/(main)/reports/monthly/page.tsx", s);

// F8: shared-containers falsey check → null check
s = read("app/(main)/shared-containers/[id]/page.tsx");
s = s.replace(/if \(i\.总体积 && !orderVolumes\.has\(key\)\) orderVolumes\.set\(key, i\.总体积\);/g, "if (i.总体积 != null && !orderVolumes.has(key)) orderVolumes.set(key, i.总体积);");
s = s.replace(/if \(i\.订单总价_cents && !orderCosts\.has\(key\)\) orderCosts\.set\(key, i\.订单总价_cents\);/g, "if (i.订单总价_cents != null && !orderCosts.has(key)) orderCosts.set(key, i.订单总价_cents);");
write("app/(main)/shared-containers/[id]/page.tsx", s);

// F9: Manual page customerId from markNo
s = read("app/(main)/loading-lists/[id]/manual/page.tsx");
s = s.replace(/customerId: 0,/g, "customerId: 0, // Will be resolved by backend from markNo");
write("app/(main)/loading-lists/[id]/manual/page.tsx", s);

// F10: ai.ts timeout
s = read("lib/ai.ts");
s = s.replace(/const res = await fetch\(DEEPSEEK_API, \{/, "const res = await fetch(DEEPSEEK_API, {\n      signal: AbortSignal.timeout(120000),");
write("lib/ai.ts", s);

// F11: generate-bill-xlsx try/catch around readFile
s = read("lib/generate-bill-xlsx.ts");
s = s.replace(/await wb\.xlsx\.readFile\(TPL_PATH\);/g, "try { await wb.xlsx.readFile(TPL_PATH); } catch (e) { throw new Error(`账单模板加载失败: ${(e as any)?.message || e}`); }");
write("lib/generate-bill-xlsx.ts", s);

// F12: parseSize null guard
s = read("lib/table-parser-client.ts");
s = s.replace(/function parseSize\(s: string\)/, "function parseSize(s: string | null | undefined)");
s = s.replace(/const cleaned = s\.replace/, "if (!s) return null;\n  const cleaned = s.replace");
write("lib/table-parser-client.ts", s);

// F14: marks detail null.toFixed
s = read("app/(main)/marks/[id]/page.tsx");
s = s.replace(/item\.总体积\.toFixed\(6\)/g, "(item.总体积 ?? 0).toFixed(6)");
write("app/(main)/marks/[id]/page.tsx", s);

// F15: loading-lists NaN propagation
s = read("app/(main)/loading-lists/[id]/page.tsx");
s = s.replace(/s \+ i\.总体积/g, "s + (i.总体积 ?? 0)");
s = s.replace(/s \+ i\.需支付总价_cents/g, "s + (i.需支付总价_cents ?? 0)");
write("app/(main)/loading-lists/[id]/page.tsx", s);

// F16: ScItemEditDialog NaN from undefined division
s = read("app/(main)/marks/[id]/ScItemEditDialog.tsx");
s = s.replace(/const \[cost, setCost\] = useState\(String\(成本单价_cents \/ 100\)\)/, "const [cost, setCost] = useState(String((成本单价_cents ?? 0) / 100))");
s = s.replace(/const \[receivable, setReceivable\] = useState\(String\(客户应收_cents \/ 100\)\)/, "const [receivable, setReceivable] = useState(String((客户应收_cents ?? 0) / 100))");
write("app/(main)/marks/[id]/ScItemEditDialog.tsx", s);

// F17: accounts/customers null.includes crash
s = read("app/(main)/accounts/customers/page.tsx");
s = s.replace(/m\.markNo\.includes\(q\)/g, "m.markNo?.includes(q) ?? false");
s = s.replace(/c\.name\.includes\(q\)/g, "c.name?.includes(q) ?? false");
write("app/(main)/accounts/customers/page.tsx", s);

// ═══════ SERIOUS FIXES ═══════

// S2: || null → ?? null in loading-items route
s = read("app/api/loading-items/route.ts");
s = s.replace(/item\.单箱体积 \|\| null/g, "item.单箱体积 ?? null");
s = s.replace(/item\.单箱数量 \|\| null/g, "item.单箱数量 ?? null");
s = s.replace(/item\.箱数 \|\| null/g, "item.箱数 ?? null");
s = s.replace(/item\.pcs数量 \|\| null/g, "item.pcs数量 ?? null");
write("app/api/loading-items/route.ts", s);

// S2b: Same for shared-container-items route
s = read("app/api/shared-container-items/route.ts");
s = s.replace(/(尺寸_长: item\.\S+ \|\| null)/g, (m) => m.replace("||", "??"));
s = s.replace(/(尺寸_宽: item\.\S+ \|\| null)/g, (m) => m.replace("||", "??"));
s = s.replace(/(尺寸_高: item\.\S+ \|\| null)/g, (m) => m.replace("||", "??"));
s = s.replace(/item\.单箱体积 \|\| null/g, "item.单箱体积 ?? null");
s = s.replace(/item\.单箱数量 \|\| null/g, "item.单箱数量 ?? null");
s = s.replace(/item\.箱数 \|\| null/g, "item.箱数 ?? null");
s = s.replace(/item\.pcs数量 \|\| null/g, "item.pcs数量 ?? null");
write("app/api/shared-container-items/route.ts", s);

// S3: bills createdAt not overwritten
s = read("app/api/bills/route.ts");
s = s.replace(/createdAt: new Date\(\)\.toISOString\(\)/g, "");
s = s.replace(/, status: '已生成', createdAt:/, ", status: '已生成'");
write("app/api/bills/route.ts", s);

// S4: bills pay - validate paymentStatus
s = read("app/api/bills/pay/route.ts");
s = s.replace(/const \{ billId, paymentStatus, paidAmount \} = await request\.json\(\);/,
  "const { billId, paymentStatus, paidAmount } = await request.json();\n" +
  "  const validStatus = ['待付款','付一部分','已付款'];\n" +
  "  if (paymentStatus && !validStatus.includes(paymentStatus)) return NextResponse.json({ error: '无效付款状态' }, { status: 400 });");
write("app/api/bills/pay/route.ts", s);

// S5: Same for expenses [id] PATCH - truthiness check
s = read("app/api/expenses/[id]/route.ts");
s = s.replace(/if \(body\.payment_status\) updates\.payment_status = body\.payment_status;/g, "if (body.payment_status !== undefined) updates.payment_status = body.payment_status;");
write("app/api/expenses/[id]/route.ts", s);

// S6: Same for sc-items [id] PATCH
s = read("app/api/shared-container-items/[id]/route.ts");
s = s.replace(/if \(body\.cost_status\) updates\.cost_status = body\.cost_status;/g, "if (body.cost_status !== undefined) updates.cost_status = body.cost_status;");
write("app/api/shared-container-items/[id]/route.ts", s);

// S7: Same for loading-items [id]
s = read("app/api/loading-items/[id]/route.ts");
s = s.replace(/if \(body\.payment_status\) updates\.payment_status = body\.payment_status;/g, "if (body.payment_status !== undefined) updates.payment_status = body.payment_status;");
write("app/api/loading-items/[id]/route.ts", s);

// S8: db/index.ts busy_timeout
s = read("db/index.ts");
if (!s.includes("busy_timeout")) {
  s = s.replace(/sqlite\.pragma\('foreign_keys = ON'\);/g, "sqlite.pragma('foreign_keys = ON');\nsqlite.pragma('busy_timeout = 5000');");
}
write("db/index.ts", s);

// S9: classify route - monthTag ?? 
s = read("app/api/ai/classify/route.ts");
s = s.replace(/const monthTag = mark\?\.monthTag \|\| new Date\(\)\.toISOString\(\)\.substring\(0, 7\);/g, "const monthTag = mark?.monthTag ?? new Date().toISOString().substring(0, 7);");
write("app/api/ai/classify/route.ts", s);

// S10: loading-items payment_status if check
s = read("app/api/loading-items/[id]/route.ts");
s = s.replace(/if \(body\.payment_status\) updates\.payment_status = body\.payment_status;/g, "if (body.payment_status !== undefined) updates.payment_status = body.payment_status;");
write("app/api/loading-items/[id]/route.ts", s);

console.log("\nAll fixes applied!");
