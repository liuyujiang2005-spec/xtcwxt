const fs = require("fs");
const fp = "/root/xtcwxt/src/app/(main)/page.tsx";
let src = fs.readFileSync(fp, "utf8");

// Remove Math.round( ... * 100) wrapping for SC and LD items
src = src.replace(/Math\.round\((\s*allScItems[\s\S]*?\))\s*\*\s*100\s*\)/g, "$1");
src = src.replace(/Math\.round\((\s*allLdItems[\s\S]*?\))\s*\*\s*100\s*\)/g, "$1");

// Fix formatCents on Math.max
src = src.replace(/formatCents\(Math\.max\(0,\s*totalRevenue\s*-\s*totalReceived\)\)/g,
  "¥Math.max(0, totalRevenue - totalReceived).toFixed(6)");

fs.writeFileSync(fp, src);
console.log("dashboard fixed");
