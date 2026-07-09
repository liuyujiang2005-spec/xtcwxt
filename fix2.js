const fs = require("fs");

function fixFile(fp) {
  let src = fs.readFileSync(fp, "utf8");
  // formatCents(val, val.currency || undefined) → ¥val.toFixed(6)
  src = src.replace(/formatCents\(([^,]+),\s*[^)]+\)/g, "¥$1.toFixed(6)");
  fs.writeFileSync(fp, src);
  console.log("fixed", fp);
}

fixFile("/root/xtcwxt/src/app/(main)/costs/page.tsx");
fixFile("/root/xtcwxt/src/app/(main)/direct-income/page.tsx");
