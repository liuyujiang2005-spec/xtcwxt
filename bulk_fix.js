const fs = require("fs");
const path = require("path");

const root = "/root/xtcwxt/src";
const results = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      walk(full);
    } else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) {
      processFile(full);
    }
  }
}

function processFile(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  let changed = false;
  const changes = [];

  // Rule 1: Remove import { formatCents } (but keep other imports from same module)
  if (src.includes("import { formatCents }")) {
    // Replace import { formatCents } from '@/lib/format' → remove entirely
    src = src.replace(/import \{\s*formatCents\s*\}\s*from\s*['"]@\/lib\/format['"]\s*;?\s*\n/g, "");
    // Handle case: import { formatCents } ... (with no line break)
    src = src.replace(/import \{\s*formatCents\s*\}\s*from\s*['"]@\/lib\/format['"]\s*;?\s*/g, "");
    // Handle import { X, formatCents } format
    src = src.replace(/import \{\s*formatCents\s*,\s*/g, "import {");
    src = src.replace(/,\s*formatCents\s*\}/g, "}");
    changes.push("removed formatCents import");
    changed = true;
  }

  // Rule 2: Replace formatCents(value) → ¥{(value).toFixed(6)}
  // Pattern: formatCents(X) → ¥{X.toFixed(6)}
  // Pattern: formatCents(X, 'THB') → THB {X.toFixed(6)}  
  let formatCount = 0;
  src = src.replace(/formatCents\(([^,)]+)\)/g, (match, val) => {
    formatCount++;
    return `¥${val.trim()}.toFixed(6)`;
  });
  src = src.replace(/formatCents\(([^,]+),\s*['"]THB['"]\s*\)/g, (match, val) => {
    formatCount++;
    return `THB ${val.trim()}.toFixed(6)`;
  });
  if (formatCount > 0) { changes.push(`replaced ${formatCount} formatCents calls`); changed = true; }

  // Rule 3: Remove Math.round(x * 100) → just x
  let mathCount = 0;
  src = src.replace(/Math\.round\(\s*(.+?)\s*\*\s*100\s*\)/g, (match, expr) => {
    mathCount++;
    return expr.trim();
  });
  if (mathCount > 0) { changes.push(`removed ${mathCount} Math.round(*100)`); changed = true; }

  if (changed) {
    fs.writeFileSync(filePath, src, "utf8");
    results.push({ file: filePath.replace(root + "/", ""), changes });
  }
}

walk(root);

console.log(`Processed ${results.length} files:`);
results.forEach(r => console.log(`  ${r.file}: ${r.changes.join(", ")}`));
