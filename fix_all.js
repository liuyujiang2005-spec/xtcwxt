const fs = require("fs");
const path = require("path");

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      walk(full);
    } else if (entry.isFile() && (full.endsWith(".tsx") || full.endsWith(".ts"))) {
      let s = fs.readFileSync(full, "utf8");
      let changed = false;
      
      // Fix: CNY without quotes → 'CNY'
      if (s.includes("|| CNY)")) {
        s = s.replace(/\|\| CNY\)/g, "|| 'CNY')");
        changed = true;
      }
      // Fix: setCurrency without wrapper
      if (s.includes("onValueChange={setCurrency}")) {
        s = s.replace(/onValueChange=\{setCurrency\}/g, "onValueChange={v => setCurrency(v || 'CNY')}");
        changed = true;
      }
      
      if (changed) {
        fs.writeFileSync(full, s);
        console.log("fixed:", full);
      }
    }
  }
}

walk("src/app");
