const http = require("http");
const D = require("./node_modules/better-sqlite3");
const db = new D("./data.db");
let SID = "";

function post(path, body, cb) {
  const d = JSON.stringify(body);
  const r = http.request({
    hostname: "localhost", port: 3000, path, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d), "Cookie": "session=" + SID }
  }, res => {
    let b = ""; res.on("data", c => b += c); res.on("end", () => cb(res.statusCode, b));
  });
  r.write(d); r.end();
}

function get(path, cb) {
  http.request({
    hostname: "localhost", port: 3000, path, method: "GET",
    headers: { "Cookie": "session=" + SID }
  }, res => {
    let chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => cb(res.statusCode, Buffer.concat(chunks)));
  }).end();
}

// Login first
const loginBody = JSON.stringify({ username: "admin", password: "admin123" });
const lr = http.request({
  hostname: "localhost", port: 3000, path: "/api/auth/login", method: "POST",
  headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(loginBody) }
}, res => {
  let b = ""; res.on("data", c => b += c);
  res.on("end", () => {
    const cookies = res.headers["set-cookie"] || [];
    const sc = cookies.find(c => c.startsWith("session="));
    SID = sc ? sc.split(";")[0].split("=")[1] : "";
    console.log("Login OK, testing loading batch create...");

    // Test batch create with POST
    post("/api/loading-batches", { batchNo: "LD-TEST-" + Date.now().toString().slice(-6), originalFilename: "auto-test" }, (code, body) => {
      console.log("Batch create: " + (code === 200 ? "200 OK" : "FAIL " + code) + " body: " + body.substring(0, 100));

      // Test manual entry page
      get("/loading-lists/1/manual", (code2) => {
        console.log("Manual page: " + (code2 === 200 ? "200 OK" : "FAIL " + code2));

        // Check SC cost dedup
        console.log("\n=== SC cost dedup check ===");
        const rows = db.prepare("SELECT 运单号, 需支付总价_cents, 订单总价_cents FROM shared_container_items LIMIT 10").all();
        rows.forEach(r => console.log("  " + r["运单号"] + ": cost=" + r["需支付总价_cents"] + " orderPrice=" + r["订单总价_cents"]));

        const orders = db.prepare("SELECT DISTINCT 运单号, 订单总价_cents FROM shared_container_items WHERE 订单总价_cents NOT NULL AND 订单总价_cents > 0 LIMIT 5").all();
        console.log("Distinct orders sample:");
        orders.forEach(o => console.log("  " + o["运单号"] + ": " + o["订单总价_cents"]));

        const dedupSum = db.prepare("SELECT SUM(total) as s FROM (SELECT DISTINCT 运单号, 订单总价_cents as total FROM shared_container_items WHERE 订单总价_cents NOT NULL AND 订单总价_cents > 0)").get();
        console.log("Deduped order total sum: " + (dedupSum.s || 0).toFixed(2));

        // Check all cost sum
        const costSum = db.prepare("SELECT SUM(需支付总价_cents) as s FROM shared_container_items").get();
        console.log("Total cost sum: " + (costSum.s || 0).toFixed(2));

        // Decimal check
        console.log("\n=== Decimal precision ===");
        const sample = db.prepare("SELECT 总体积, 单箱体积, 需支付总价_cents FROM shared_container_items LIMIT 3").all();
        sample.forEach(s => console.log("  体积:" + s.总体积 + " 单箱:" + s.单箱体积 + " 成本:" + s.需支付总价_cents));
        console.log("All have decimals: " + sample.every(s => String(s.总体积).indexOf(".") > -1));

        db.close();
        console.log("\nAll tests complete.");
      });
    });
  });
});
lr.write(loginBody); lr.end();
