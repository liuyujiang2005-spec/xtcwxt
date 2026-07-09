const fs = require("fs");
const path = require("path");
const root = "/root/xtcwxt/src";
let count = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      walk(full);
    } else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) {
      let src = fs.readFileSync(full, "utf8");
      let changed = false;

      // Fix broken replacements: ¥${X}.toFixed(6) → ¥{X.toFixed(6)}
      const before = src.length;
      src = src.replace(/¥\$\{([^}]+)\}\.toFixed\((\d+)\)/g, "¥{$1.toFixed($2)}");
      src = src.replace(/THB \$?\{([^}]+)\.toFixed\((\d+)\)\}/g, "THB {$1.toFixed($2)}");
      if (src.length !== before) { changed = true; count++; }

      if (changed) fs.writeFileSync(full, src, "utf8");
    }
  }
}

walk(root);
console.log("Fixed", count, "files");
