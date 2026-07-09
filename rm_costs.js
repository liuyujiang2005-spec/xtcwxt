const fs = require("fs");

// Delete costs directory
fs.rmSync("src/app/(main)/costs", { recursive: true, force: true });
console.log("costs deleted");

// Fix sidebar
let s = fs.readFileSync("src/components/sidebar.tsx", "utf8");
s = s.replace(/\s*\{ name: '费用管理', href: '\/costs', icon: DollarSign \},?\n?/g, "");
s = s.replace(/'费用管理', /g, "");
fs.writeFileSync("src/components/sidebar.tsx", s);
console.log("sidebar fixed");

// Fix expenses page
s = fs.readFileSync("src/app/(main)/expenses/page.tsx", "utf8");
// Replace /costs/new → /direct-income/new
s = s.replace(/\/costs\/new/g, "/direct-income/new");
// Remove edit link to /costs/[id]
s = s.replace(/<Link href=\{\`\/costs\/\$\{(e as any)\.id\}\`\}><Button variant="ghost" size="sm">编辑<\/Button><\/Link>/g, "");
fs.writeFileSync("src/app/(main)/expenses/page.tsx", s);
console.log("expenses fixed");
