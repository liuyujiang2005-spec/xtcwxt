const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = "/root/xtcwxt/src";

// 1. Delete entire directories
const delDirs = [
  "app/api/suppliers",
  "app/api/payments/made",
  "app/(main)/suppliers",
  "app/(main)/accounts/suppliers",
];
delDirs.forEach(d => {
  const fp = path.join(root, d);
  if (fs.existsSync(fp)) { fs.rmSync(fp, { recursive: true }); console.log("Deleted dir:", d); }
});

// 2. Fix sidebar
let sidebar = fs.readFileSync(path.join(root, "components/sidebar.tsx"), "utf8");
sidebar = sidebar.replace(/.*供应商管理.*\n/g, "");
sidebar = sidebar.replace(/.*供应商应付.*\n/g, "");
sidebar = sidebar.replace(/.*供应商.*\n/g, ""); // catch any remaining
sidebar = sidebar.replace(/import.*supplier.*\n/gi, "");
fs.writeFileSync(path.join(root, "components/sidebar.tsx"), sidebar);
console.log("Fixed sidebar");

// 3. Fix schema.ts
let schema = fs.readFileSync(path.join(root, "db/schema.ts"), "utf8");
// Remove suppliers table definition
schema = schema.replace(/export const suppliers = sqliteTable\([\s\S]*?\n\}\);\n\n/g, "");
// Remove payments_made table definition
schema = schema.replace(/export const payments_made = sqliteTable\([\s\S]*?\n\}\);\n\n/g, "");
// Remove suppliers from billItems references
schema = schema.replace(/, suppliers/g, "").replace(/import.*suppliers.*\n/g, "");
fs.writeFileSync(path.join(root, "db/schema.ts"), schema);
console.log("Fixed schema");

// 4. Fix seed.ts
let seed = fs.readFileSync("/root/xtcwxt/src/db/seed.ts", "utf8");
seed = seed.replace(/CREATE TABLE IF NOT EXISTS suppliers[\s\S]*?\n\);/g, "");
seed = seed.replace(/CREATE TABLE IF NOT EXISTS payments_made[\s\S]*?\n\);/g, "");
fs.writeFileSync("/root/xtcwxt/src/db/seed.ts", seed);
console.log("Fixed seed");

// 5. Fix expenses route.ts
let expRoute = fs.readFileSync(path.join(root, "app/api/expenses/route.ts"), "utf8");
expRoute = expRoute.replace(/, suppliers/g, "");
expRoute = expRoute.replace(/import.*suppliers.*\n/g, "");
expRoute = expRoute.replace(/\s*supplierId:\s*body\.supplierId.*\n/g, "");
fs.writeFileSync(path.join(root, "app/api/expenses/route.ts"), expRoute);
console.log("Fixed expenses route");

// 6. Fix expenses [id]/route.ts
let expIdRoute = fs.readFileSync(path.join(root, "app/api/expenses/[id]/route.ts"), "utf8");
expIdRoute = expIdRoute.replace(/\s*supplierId:.*\n/g, "");
fs.writeFileSync(path.join(root, "app/api/expenses/[id]/route.ts"), expIdRoute);
console.log("Fixed expenses [id] route");

// 7. Fix costs/page.tsx - remove supplier column
let costsPage = fs.readFileSync(path.join(root, "app/(main)/costs/page.tsx"), "utf8");
costsPage = costsPage.replace(/import.*suppliers.*\n/g, "");
costsPage = costsPage.replace(/const allSuppliers.*\n.*\n/g, "");
costsPage = costsPage.replace(/const supplierMap.*\n/g, "");
costsPage = costsPage.replace(/<TableHead>供应商<\/TableHead>/g, "");
costsPage = costsPage.replace(/<TableCell className="text-sm">.*supplierMap.*<\/TableCell>/g, "");
fs.writeFileSync(path.join(root, "app/(main)/costs/page.tsx"), costsPage);
console.log("Fixed costs page");

// 8. Fix expenses/page.tsx - remove supplier block
let expPage = fs.readFileSync(path.join(root, "app/(main)/expenses/page.tsx"), "utf8");
expPage = expPage.replace(/, suppliers/g, "");
expPage = expPage.replace(/import.*suppliers.*\n/g, "");
expPage = expPage.replace(/const allSuppliers.*\n.*\n/g, "");
expPage = expPage.replace(/const supplierMap.*\n/g, "");
expPage = expPage.replace(/const bySupplier[\s\S]*?\n  \}\);\n/g, "");
expPage = expPage.replace(/<Card>[\s\S]*?按供应商[\s\S]*?<\/Card>/g, "");
expPage = expPage.replace(/supplierMap\.get\(e\.supplierId[\s\S]*?\) || '-'/g, "'-'");
fs.writeFileSync(path.join(root, "app/(main)/expenses/page.tsx"), expPage);
console.log("Fixed expenses page");

console.log("Done!");
