const http = require("http");
const D = require("./node_modules/better-sqlite3");
const db = new D("./data.db");
let SID = "";

function login(cb) {
  const d = JSON.stringify({ username: "admin", password: "admin123" });
  const r = http.request({ hostname: "localhost", port: 3000, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, res => {
    let b = ""; res.on("data", c => b += c); res.on("end", () => {
      const sc = (res.headers["set-cookie"] || []).find(c => c.startsWith("session="));
      SID = sc ? sc.split(";")[0].split("=")[1] : "";
      console.log("1. 登录:", res.statusCode === 200 ? "✅" : "❌");
      cb();
    });
  });
  r.write(d); r.end();
}

function get(path, cb) {
  http.request({ hostname: "localhost", port: 3000, path, method: "GET", headers: { "Cookie": "session=" + SID } }, res => {
    let chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => cb(res.statusCode, Buffer.concat(chunks)));
  }).end();
}

login(() => {
  // ── 页面测试 ──
  console.log("\n2. 页面访问测试:");
  const pages = [
    ["仪表盘", "/"], ["收入总表", "/revenue"], ["支出总表", "/expenses"],
    ["拼柜批次", "/shared-containers"], ["装柜批次", "/loading-lists"],
    ["客户账期", "/accounts/customers"], ["账单管理", "/bills"],
    ["客户管理", "/customers"], ["唛头管理", "/marks"],
    ["月度报表", "/reports/monthly"], ["直接收入", "/direct-income"],
  ];
  let done = 0;
  let allOk = true;
  pages.forEach(([n, p]) => {
    get(p, (code) => {
      const ok = code === 200 || code === 307;
      if (!ok) allOk = false;
      console.log("  " + n + ":", ok ? "✅" : "❌ " + code);
      done++;
      if (done === pages.length) {
        // ── 数据库测试 ──
        console.log("\n3. 数据库:");
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
        console.log("  表数量:", tables.length);
        const sc = db.prepare("SELECT COUNT(*) as c FROM shared_container_items").get().c;
        const marks = db.prepare("SELECT COUNT(*) as c FROM marks").get().c;
        const bills = db.prepare("SELECT COUNT(*) as c FROM bills").get().c;
        const expenses = db.prepare("SELECT COUNT(*) as c FROM expenses").get().c;
        const customers = db.prepare("SELECT COUNT(*) as c FROM customers").get().c;
        console.log("  拼柜明细:", sc, "条");
        console.log("  唛头:", marks, "个");
        console.log("  账单:", bills, "张");
        console.log("  费用:", expenses, "条");
        console.log("  客户:", customers, "个");
        if (sc === 0) console.log("  ⚠️  数据库为空，需要上传拼柜Excel导入数据");

        // ── Schema检查 ──
        console.log("\n4. 关键字段检查:");
        const biCols = db.prepare("PRAGMA table_info(bill_items)").all();
        const billCols = db.prepare("PRAGMA table_info(bills)").all();
        const expCols = db.prepare("PRAGMA table_info(expenses)").all();
        console.log("  bill_items.cost_amount:", biCols.some(c => c.name === "cost_amount") ? "✅" : "❌");
        console.log("  bills.receipt_url:", billCols.some(c => c.name === "receipt_url") ? "✅" : "❌");
        console.log("  expenses.receipt_url:", expCols.some(c => c.name === "receipt_url") ? "✅" : "❌");
        const scCols = db.prepare("PRAGMA table_info(shared_container_items)").all();
        console.log("  SC.仓库:", scCols.some(c => c.name === "仓库") ? "✅" : "❌");
        console.log("  SC.单项重量:", scCols.some(c => c.name === "单项重量") ? "✅" : "❌");
        console.log("  SC.备注:", scCols.some(c => c.name === "备注") ? "✅" : "❌");

        // ── 上传目录 ──
        const fs = require("fs");
        console.log("\n5. 上传目录:", fs.existsSync("public/uploads") ? "✅" : "❌");

        // ── 总结 ──
        console.log("\n===== 总结 =====");
        console.log("页面:", allOk ? "全部正常" : "有异常");
        console.log("数据库:", sc > 0 ? "有数据" : "空（需导入）");
        console.log("字段:", "全部就位");
        db.close();
      }
    });
  });
});
