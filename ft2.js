const http = require("http");
const X = require("exceljs");
const D = require("./node_modules/better-sqlite3");
const db = new D("./data.db");
let SID = "";

function login(cb) {
  const d = JSON.stringify({ username: "admin", password: "Aa112233" });
  const r = http.request({ hostname: "localhost", port: 3000, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, res => {
    let b = ""; res.on("data", c => b += c); res.on("end", () => {
      const sc = (res.headers["set-cookie"] || []).find(c => c.startsWith("session="));
      SID = sc ? sc.split(";")[0].split("=")[1] : "";
      cb();
    });
  });
  r.write(d); r.end();
}

login(() => {
  const bill = db.prepare("SELECT b.id, b.bill_no, (SELECT COUNT(*) FROM bill_items WHERE bill_id=b.id) as cnt FROM bills b ORDER BY cnt DESC LIMIT 1").get();
  console.log("账单:", bill.bill_no, "明细:", bill.cnt);
  
  const opts = { hostname: "localhost", port: 3000, path: "/api/bills/export?billId=" + bill.id, method: "GET", headers: { "Cookie": "session=" + SID } };
  http.request(opts, res => {
    let chunks = []; res.on("data", c => chunks.push(c)); res.on("end", async () => {
      console.log("状态:", res.statusCode, "大小:", Buffer.concat(chunks).length);
      const wb = new X.Workbook();
      await wb.xlsx.load(Buffer.concat(chunks));
      const ws = wb.worksheets[0];

      let dataCount = 0, borderOK = true;
      let hasNotice = false, hasBank = false, hasQR = ws.getImages().length > 0;

      for (let r = 1; r <= ws.rowCount; r++) {
        const v1 = String(ws.getCell(r, 1).value || '');
        if (r >= 8 && v1.match(/^\d{4}-\d{2}-\d{2}/)) {
          dataCount++;
          const b = ws.getCell(r, 1).border;
          if (!b || !b.top || !b.left) borderOK = false;
        }
        if (v1.includes('工作日') && v1.length > 20) hasNotice = true;
        if (v1.includes('收款账户') || v1.includes('621226')) hasBank = true;
      }

      // Show last 8 rows
      console.log("\n尾部行:");
      for (let r = Math.max(1, ws.rowCount - 7); r <= ws.rowCount; r++) {
        const rv = [];
        for (let c = 1; c <= 3; c++) rv.push(String(ws.getCell(r, c).value || '.').substring(0, 30));
        console.log("R" + r + ": " + rv.join(" | "));
      }

      console.log("\n结果:");
      console.log("数据行:", dataCount, "边框:", borderOK ? "✅" : "❌");
      console.log("提示语:", hasNotice ? "✅" : "❌");
      console.log("银行账号:", hasBank ? "✅" : "❌");
      console.log("二维码:", hasQR ? "✅" : "❌");
      console.log(hasNotice && hasBank && borderOK && hasQR ? "\n✅ 全部通过" : "\n❌ 有问题");
      db.close();
    });
  }).end();
});
