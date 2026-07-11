const http = require("http"); const D = require("./node_modules/better-sqlite3"); const db = new D("./data.db");
const HOST = "127.0.0.1";
const d = JSON.stringify({ username: "admin", password: "Aa112233" });
http.request({ hostname: HOST, port: 3000, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, res => {
  let b = ""; res.on("data", c => b += c); res.on("end", () => {
    const sc = (res.headers["set-cookie"] || []).find(c => c.startsWith("session="));
    if (!sc) { console.log("Login failed:", res.statusCode, b.substring(0, 50)); db.close(); return; }
    const sid = sc.split(";")[0].split("=")[1];
    const bill = db.prepare("SELECT id, bill_no, total_amount_cents FROM bills LIMIT 1").get();
    console.log("Bill:", bill.bill_no, "Before:", bill.total_amount_cents);
    const rd = JSON.stringify({ billId: bill.id });
    http.request({ hostname: HOST, port: 3000, path: "/api/bills/refresh", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(rd), "Cookie": "session=" + sid } }, res2 => {
      let b2 = ""; res2.on("data", c => b2 += c); res2.on("end", () => { console.log("Status:", res2.statusCode, "Resp:", b2.substring(0, 100)); const after = db.prepare("SELECT total_amount_cents FROM bills WHERE id = ?").get(bill.id); console.log("After:", after ? after.total_amount_cents : "NULL"); db.close(); });
    }).end();
  });
}).end();
