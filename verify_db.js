const D = require("better-sqlite3");
const d = new D("/root/xtcwxt/data.db");

console.log("=== SC Items sample (first 5) ===");
const sc = d.prepare("SELECT 需支付总价_cents, 成本单价_cents, 客户应收_cents, 订单总价_cents, 总体积 FROM shared_container_items LIMIT 5").all();
sc.forEach(r => console.log("需支付:", r["需支付总价_cents"], " | 成本单价:", r["成本单价_cents"], " | 客户应收:", r["客户应收_cents"], " | 订单总价:", r["订单总价_cents"], " | 体积:", r["总体积"]));

console.log("\n=== Bills sample (first 3) ===");
const b = d.prepare("SELECT billNo, totalAmountCents, paidAmount, remainingAmount FROM bills LIMIT 3").all();
b.forEach(r => console.log(r.billNo, " | total:", r.totalAmountCents, " | paid:", r.paidAmount, " | remain:", r.remainingAmount));

console.log("\n=== Bill Items sample (first 5) ===");
const bi = d.prepare("SELECT amountCents, mode FROM bill_items LIMIT 5").all();
bi.forEach(r => console.log("amount:", r.amountCents, " | mode:", r.mode));

console.log("\n=== Direct Income sample ===");
const di = d.prepare("SELECT amountCents, currency FROM directIncome LIMIT 3").all();
di.forEach(r => console.log("amountCents:", r.amountCents, " | currency:", r.currency));

console.log("\n=== Dimensions ===");
const dim = d.prepare("SELECT COUNT(*) as cnt FROM shared_container_items WHERE 尺寸_长 > 0 OR 尺寸_宽 > 0 OR 尺寸_高 > 0").get();
const total = d.prepare("SELECT COUNT(*) as cnt FROM shared_container_items").get();
console.log("Has dims:", dim.cnt, " / Total:", total.cnt);

console.log("\n=== 订单总价_cents sample ===");
const order = d.prepare("SELECT 订单总价_cents FROM shared_container_items WHERE 订单总价_cents IS NOT NULL LIMIT 5").all();
order.forEach(r => console.log(r["订单总价_cents"]));

console.log("\n=== Bill items per mark (top 3) ===");
const mk1 = d.prepare("SELECT markId, COUNT(*) as cnt FROM bill_items GROUP BY markId ORDER BY cnt DESC LIMIT 3").all();
mk1.forEach(r => console.log("markId:", r.markId, " | bill_items:", r.cnt));

console.log("\n=== SC items per mark (same 3) ===");
const midIds = mk1.map(r => r.markId);
midIds.forEach(mid => {
  const c = d.prepare("SELECT COUNT(*) as cnt FROM shared_container_items WHERE markId = ?").get(mid);
  console.log("markId:", mid, " | sc_items:", c.cnt);
});

console.log("\n=== One mark full bill items ===");
const first = mk1[0];
const fullBI = d.prepare("SELECT * FROM bill_items WHERE markId = ?").all(first.markId);
fullBI.forEach(r => console.log("id:", r.id, "billId:", r.billId, "markId:", r.markId, "amount:", r.amountCents, "mode:", r.mode));

console.log("\n=== One mark full SC items ===");
const fullSC = d.prepare("SELECT id, 运单号, 总体积, 需支付总价_cents, 成本单价_cents FROM shared_container_items WHERE markId = ?").all(first.markId);
fullSC.forEach(r => console.log("id:", r.id, "运单号:", r["运单号"], "总体积:", r["总体积"], "需支付:", r["需支付总价_cents"], "成本单价:", r["成本单价_cents"]));
