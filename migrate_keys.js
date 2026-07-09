const D = require("better-sqlite3");
const d = new D("./data.db");
const mapping = {
  "海运 - 普货": "sea_regular", "海运 - 敏感货": "sea_sensitive", "海运 - 商检货": "sea_inspection",
  "陆运 - 普货": "land_regular", "陆运 - 敏感货": "land_sensitive", "陆运 - 商检货": "land_inspection",
  "海运-普货": "sea_regular", "海运-敏感货": "sea_sensitive", "海运-商检货": "sea_inspection",
  "陆运-普货": "land_regular", "陆运-敏感货": "land_sensitive", "陆运-商检货": "land_inspection",
};

const customers = d.prepare("SELECT id, name, price_matrix FROM customers WHERE price_matrix IS NOT NULL").all();
let updated = 0;
for (const c of customers) {
  try {
    const m = JSON.parse(c.price_matrix);
    let changed = false;
    const newM = {};
    for (const [k, v] of Object.entries(m)) {
      const engKey = mapping[k] || k;
      newM[engKey] = v;
      if (engKey !== k) changed = true;
    }
    if (changed) {
      d.prepare("UPDATE customers SET price_matrix = ? WHERE id = ?").run(JSON.stringify(newM), c.id);
      updated++;
    }
  } catch {}
}
console.log(`Migrated ${updated} customers from Chinese keys to English keys`);
d.close();
