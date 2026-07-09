const D = require("better-sqlite3");
const d = new D("./data.db");
d.pragma("foreign_keys = OFF");

console.log("=== Rebuilding bill_items correctly ===");

// Delete all bill items first
d.prepare("DELETE FROM bill_items").run();

// For each bill, get its customer and recreate items from that customer's marks
const bills = d.prepare("SELECT b.id as bill_id, b.customer_id, b.month_tag FROM bills b").all();

for (const { bill_id, customer_id, month_tag } of bills) {
  // Get marks for this customer in this month
  const marks = d.prepare("SELECT id FROM marks WHERE customer_id = ? AND month_tag = ?").all(customer_id, month_tag);
  
  const insertStmt = d.prepare("INSERT INTO bill_items (bill_id, mark_id, mode, amount_cents) VALUES (?, ?, ?, ?)");
  
  for (const { id: markId } of marks) {
    const scItems = d.prepare("SELECT 运单号, 订单总价_cents, 需支付总价_cents FROM shared_container_items WHERE mark_id = ?").all(markId);
    const ldItems = d.prepare("SELECT id, 需支付总价_cents FROM loading_items WHERE mark_id = ?").all(markId).map(r => ({ ...r, 运单号: `ld_${r.id}` }));
    const allItems = [...scItems, ...ldItems];
    if (allItems.length === 0) continue;

    const seen = new Set();
    for (const item of allItems) {
      const key = item["运单号"] || `_${item.id || Math.random()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const amount = Math.round(item["订单总价_cents"] || item["需支付总价_cents"] || 0);
      if (amount > 0) insertStmt.run(bill_id, markId, '拼柜', amount);
    }
  }

  // Recalculate bill total
  const total = d.prepare("SELECT SUM(amount_cents) as t FROM bill_items WHERE bill_id = ?").get(bill_id);
  d.prepare("UPDATE bills SET total_amount_cents = ? WHERE id = ?").run(total.t || 0, bill_id);
}

const newCount = d.prepare("SELECT COUNT(*) as cnt FROM bill_items").get();
console.log("Bill items after correct rebuild:", newCount.cnt);

const byMark = d.prepare("SELECT mark_id, COUNT(*) as cnt FROM bill_items GROUP BY mark_id ORDER BY cnt DESC LIMIT 5").all();
console.log("Top marks:", JSON.stringify(byMark));

// Verify total bill amounts
const bSample = d.prepare("SELECT bill_no, total_amount_cents FROM bills LIMIT 3").all();
console.log("Bill totals:", JSON.stringify(bSample));

d.close();
console.log("Done!");
