const { execSync } = require("child_process");
const fs = require("fs");

console.log("=== 1. 数据库路径 ===");
const dbIndex = fs.readFileSync("src/db/index.ts", "utf8");
console.log(dbIndex.match(/DB_PATH.*/)?.[0] || "NOT FOUND");
console.log("data.db exists:", fs.existsSync("data.db"));
console.log("xiangtai.db exists:", fs.existsSync("xiangtai.db"));

console.log("\n=== 2. API Key ===");
console.log(".env:", fs.existsSync(".env") ? fs.readFileSync(".env","utf8").substring(0,200) : "NOT FOUND");
console.log(".env.local:", fs.existsSync(".env.local") ? "EXISTS" : "NOT FOUND");

console.log("\n=== 3. Middleware ===");
console.log("middleware.ts:", fs.existsSync("src/middleware.ts"));
console.log("proxy.ts:", fs.existsSync("src/proxy.ts"));

console.log("\n=== 4. 金额字段类型 ===");
const D = require("./node_modules/better-sqlite3");
const d = new D("./data.db");
["shared_container_items","bill_items","bills","loading_items","expenses","directIncome"].forEach(t => {
  try {
    const cols = d.prepare("PRAGMA table_info(" + t + ")").all();
    const moneyCols = cols.filter(c => c.name.includes("cent") || c.name.includes("amount") || c.name.includes("paid"));
    moneyCols.forEach(c => console.log(t + "." + c.name + ": " + c.type));
  } catch {}
});
d.close();

console.log("\n=== 5. 死代码 ===");
const dead = ["src/app/(main)/bills/bill-download-card.tsx", "src/app/api/payments/received/route.ts", "src/app/api/payments/made"];
dead.forEach(f => console.log(f + ": " + (fs.existsSync(f) ? "EXISTS ❌" : "GONE ✅")));
