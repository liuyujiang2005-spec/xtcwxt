const D = require("better-sqlite3");
const d = new D("./data.db");
d.pragma("foreign_keys = OFF");

console.log("=== Rebuilding bill_items with proper dedup ===");

// For each bill, rebuild its bill_items from SC/loading items
const bills = d.prepare("SELECT b.id as bill_id, b.month_tag FROM bills b").all();

for (const { bill_id, month_tag } of bills) {
  // Delete existing bill items for this bill
  d.prepare("DELETE FROM bill_items WHERE bill_id = ?").run(bill_id);

  // Get all marks for this bill's month
  const marks = d.prepare("SELECT id FROM marks WHERE month_tag = ?").all(month_tag);
  
  for (const { id: markId } of marks) {
    // Get SC items for this mark
    const scItems = d.prepare("SELECT 运单号, 订单总价_cents, 需支付总价_cents FROM shared_container_items WHERE mark_id = ?").all(markId);
    const ldItems = d.prepare("SELECT id, 需支付总价_cents FROM loading_items WHERE mark_id = ?").all(markId).map(r => ({ ...r, 运单号: `ld_${r.id}` }));
    const allItems = [...scItems, ...ldItems];

    if (allItems.length === 0) continue;

    // Dedup by 运单号
    const seen = new Set();
    const insertStmt = d.prepare("INSERT INTO bill_items (bill_id, mark_id, mode, amount_cents) VALUES (?, ?, ?, ?)");
    
    for (const item of allItems) {
      const key = item["运单号"] || `_${item.id || Math.random()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      const amount = Math.round(item["订单总价_cents"] || item["需支付总价_cents"] || 0);
      insertStmt.run(bill_id, markId, '拼柜', amount);
    }
  }

  // Recalculate bill total
  const total = d.prepare("SELECT SUM(amount_cents) as t FROM bill_items WHERE bill_id = ?").get(bill_id);
  d.prepare("UPDATE bills SET total_amount_cents = ? WHERE id = ?").run(total.t || 0, bill_id);
}

const newCount = d.prepare("SELECT COUNT(*) as cnt FROM bill_items").get();
console.log(`Bill items after rebuild: ${newCount.cnt} (was 1431)`);

const byMark = d.prepare("SELECT mark_id, COUNT(*) as cnt FROM bill_items GROUP BY mark_id ORDER BY cnt DESC LIMIT 5").all();
console.log("Top marks after rebuild:", JSON.stringify(byMark));

d.close();
console.log("Done!");
