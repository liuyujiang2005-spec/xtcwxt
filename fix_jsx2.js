const fs = require("fs");
const path = require("path");
const root = "/root/xtcwxt/src";
let fixed = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      walk(full);
    } else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) {
      let src = fs.readFileSync(full, "utf8");
      const orig = src;

      // Fix: {¥X.toFixed(N)} → ¥{X.toFixed(N)}
      src = src.replace(/\{¥([^}]+)\.toFixed\((\d+)\)\}/g, "¥{$1.toFixed($2)}");
      // Fix: {THB X.toFixed(N)} → THB {X.toFixed(N)}
      src = src.replace(/\{THB ([^}]+)\.toFixed\((\d+)\)\}/g, "THB {$1.toFixed($2)}");
      // Fix: ¥{X.toFixed(N)} that's already inside an expression block → ¥{X.toFixed(N)}
      src = src.replace(/\{¥\{([^}]+)\.toFixed\((\d+)\)\}\}/g, "¥{$1.toFixed($2)}");

      if (src !== orig) {
        fs.writeFileSync(full, src, "utf8");
        fixed++;
        console.log("fixed", full.replace(root + "/", ""));
      }
    }
  }
}

walk(root);
console.log("Fixed", fixed, "files");
