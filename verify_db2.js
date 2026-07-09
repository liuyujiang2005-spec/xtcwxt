const D = require("better-sqlite3");
const d = new D("/root/xtcwxt/data.db");

console.log("=== SC Items (first 5 with key fields) ===");
const sc = d.prepare("SELECT 需支付总价_cents, 成本单价_cents, 客户应收_cents, 订单总价_cents, 总体积, cost_status FROM shared_container_items LIMIT 5").all();
sc.forEach(r => console.log(JSON.stringify(r)));

console.log("\n=== 客户应收_cents NULL check ===");
const nullCheck = d.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN 客户应收_cents IS NULL THEN 1 ELSE 0 END) as nulls FROM shared_container_items").get();
console.log("Total:", nullCheck.total, "Null customer receivable:", nullCheck.nulls);

console.log("\n=== Bills (first 3) ===");
const b = d.prepare("SELECT bill_no, total_amount_cents, paid_amount, remaining_amount, payment_status, exported_at, paid_at, month_tag, status FROM bills LIMIT 3").all();
b.forEach(r => console.log(JSON.stringify(r)));

console.log("\n=== Bill Items (first 5) ===");
const bi = d.prepare("SELECT amount_cents, mode, mark_id, bill_id FROM bill_items LIMIT 5").all();
bi.forEach(r => console.log(JSON.stringify(r)));

console.log("\n=== Direct Income ===");
const di = d.prepare("SELECT amount_cents, currency FROM directIncome LIMIT 3").all();
di.forEach(r => console.log(JSON.stringify(r)));

console.log("\n=== Dimensions (non-zero check) ===");
const dim = d.prepare("SELECT COUNT(*) as cnt FROM shared_container_items WHERE 尺寸_长 > 0 OR 尺寸_宽 > 0 OR 尺寸_高 > 0").get();
const total = d.prepare("SELECT COUNT(*) as cnt FROM shared_container_items").get();
console.log("Has dimensions:", dim.cnt, "/", total.cnt, "(100% are", dim.cnt > 0 ? "NON-ZERO" : "ZERO", ")");

console.log("\n=== 订单总价_cents (first 5 non-null) ===");
const order = d.prepare("SELECT 订单总价_cents FROM shared_container_items WHERE 订单总价_cents IS NOT NULL LIMIT 5").all();
order.forEach(r => console.log(r["订单总价_cents"]));

console.log("\n=== Bill items per mark (top 3 marks) ===");
const mk1 = d.prepare("SELECT mark_id, COUNT(*) as cnt FROM bill_items GROUP BY mark_id ORDER BY cnt DESC LIMIT 3").all();
console.log(JSON.stringify(mk1));

console.log("\n=== SC items per mark (same 3) ===");
mk1.forEach(r => {
  const c = d.prepare("SELECT COUNT(*) as cnt FROM shared_container_items WHERE mark_id = ?").get(r.mark_id);
  console.log("mark_id:", r.mark_id, "bill_items:", r.cnt, "sc_items:", c.cnt);
});

// Deep dive: one mark
const firstMark = mk1[0].mark_id;
console.log("\n=== Deep dive: mark_id =", firstMark, "===");
console.log("--- SC items for this mark (10) ---");
const scMark = d.prepare("SELECT id, 运单号, 总体积, 需支付总价_cents, 成本单价_cents, 订单总价_cents FROM shared_container_items WHERE mark_id = ? LIMIT 10").all(firstMark);
scMark.forEach(r => console.log(JSON.stringify(r)));
console.log("--- Bill items for this mark (10) ---");
const biMark = d.prepare("SELECT id, bill_id, amount_cents, mode FROM bill_items WHERE mark_id = ? LIMIT 10").all(firstMark);
biMark.forEach(r => console.log(JSON.stringify(r)));

// Check mark_no for BL prefix
console.log("\n=== Marks (check for BL prefix) ===");
const marks = d.prepare("SELECT id, mark_no FROM marks LIMIT 10").all();
marks.forEach(r => console.log("id:", r.id, "mark_no:", r.mark_no));
const blMarks = d.prepare("SELECT COUNT(*) as cnt FROM marks WHERE mark_no LIKE 'BL-%'").get();
console.log("Marks with BL- prefix:", blMarks.cnt);
