const D = require("better-sqlite3");
const d = new D("/root/xtcwxt/data.db");

// ── Step 1: Calculate and backfill 客户应收_cents ──
console.log("=== Backfilling 客户应收_cents ===");

// Get all customers with price matrix
const customers = d.prepare("SELECT id, name, price_matrix, enable_min_volume FROM customers").all();
const custMap = new Map();
for (const c of customers) {
  try {
    custMap.set(c.id, { matrix: JSON.parse(c.price_matrix || '{}'), enableMin: c.enable_min_volume !== 0 });
  } catch { custMap.set(c.id, { matrix: {}, enableMin: false }); }
}

// Get all SC items with their mark info
const scItems = d.prepare(`
  SELECT i.id, i.总体积, i.单箱体积, i.货型, i.运输方式, i.customer_id, i.mark_id,
         m.mode as mark_mode, c.enable_min_volume
  FROM shared_container_items i
  JOIN marks m ON i.mark_id = m.id
  LEFT JOIN customers c ON i.customer_id = c.id
  WHERE i.客户应收_cents IS NULL
`).all();

console.log(`Items to update: ${scItems.length}`);

let updated = 0;
const updateStmt = d.prepare("UPDATE shared_container_items SET 客户应收_cents = ? WHERE id = ?");

d.pragma("foreign_keys = OFF");

for (const item of scItems) {
  const cust = custMap.get(item.customer_id);
  if (!cust || !cust.matrix) continue;

  const transport = item["运输方式"] === '海运' ? 'sea' : item["运输方式"] === '陆运' ? 'land' : 'sea';
  const cargo = item["货型"] === '普货' ? 'regular' : item["货型"] === '商检货' ? 'inspection' : item["货型"] === '敏货' ? 'sensitive' : 'regular';
  const key = `${transport}_${cargo}`;
  const unitPrice = cust.matrix[key] || 0;
  if (unitPrice === 0) continue;

  const minVol = cust.enableMin ? (transport === 'sea' ? 0.5 : 0.3) : 0;
  const rawVol = item["单箱体积"] || item["总体积"] || 0;
  const chargeVol = Math.max(rawVol, minVol);
  const receivableCents = Math.round(unitPrice * chargeVol * 100);

  updateStmt.run(receivableCents, item.id);
  updated++;
}

console.log(`Updated ${updated} items with customer receivable`);

// ── Step 2: Verify results ──
const verify = d.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN 客户应收_cents IS NULL OR 客户应收_cents = 0 THEN 1 ELSE 0 END) as nulls FROM shared_container_items").get();
console.log(`After backfill: Total=${verify.total}, Still null/zero=${verify.nulls}`);

// Show sample
const sample = d.prepare("SELECT 客户应收_cents, 需支付总价_cents, 总体积 FROM shared_container_items WHERE 客户应收_cents IS NOT NULL LIMIT 5").all();
console.log("Sample:", JSON.stringify(sample));

d.close();
console.log("Done!");
