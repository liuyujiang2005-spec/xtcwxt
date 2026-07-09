const D = require("better-sqlite3");
const d = new D("./data.db");

console.log("=== 批次1验证 ===");

// 1. Customer receivable backfill
const r = d.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN 客户应收_cents IS NOT NULL AND 客户应收_cents > 0 THEN 1 ELSE 0 END) as filled FROM shared_container_items").get();
console.log("1. 客户应收: filled=", r.filled, "/ total=", r.total);

// 2. Show sample filled values
const s = d.prepare("SELECT id, 客户应收_cents, 需支付总价_cents, 总体积 FROM shared_container_items WHERE 客户应收_cents > 0 LIMIT 3").all();
console.log("2. Filled samples:", JSON.stringify(s));

// 3. Check dimensions still zero (backfill can't recover from no data)
const dim = d.prepare("SELECT COUNT(*) as c FROM shared_container_items WHERE 尺寸_长 > 0 OR 尺寸_宽 > 0 OR 尺寸_高 > 0").get();
console.log("3. Non-zero dimensions:", dim.c, "/", r.total, "(will be fixed on next upload)");

// 4. Verify table structure
const cols = d.prepare("PRAGMA table_info(shared_container_items)").all();
const hasCol = (name) => cols.some(c => c.name === name);
console.log("4. Has 客户应收 column:", hasCol("客户应收_cents"));
console.log("   Has 尺寸 columns:", hasCol("尺寸_长"), hasCol("尺寸_宽"), hasCol("尺寸_高"));

d.close();
console.log("=== DONE ===");
