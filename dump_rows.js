const X = require("exceljs");
const http = require("http");
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
  const bill = db.prepare("SELECT id FROM bills ORDER BY ROWID DESC LIMIT 1").get();
  const opts = { hostname: "localhost", port: 3000, path: "/api/bills/export?billId=" + bill.id, method: "GET", headers: { "Cookie": "session=" + SID } };
  http.request(opts, res => {
    let chunks = []; res.on("data", c => chunks.push(c)); res.on("end", async () => {
      const wb = new X.Workbook();
      await wb.xlsx.load(Buffer.concat(chunks));
      const ws = wb.worksheets[0];
      console.log("=== ROW BY ROW DUMP (rows 1-20) ===");
      for (let r = 1; r <= 20; r++) {
        const row = [];
        for (let c = 1; c <= 5; c++) {
          const v = ws.getCell(r, c).value;
          row.push(v != null ? String(v).substring(0, 25) : ".");
        }
        console.log("R" + r + ": " + row.join(" | "));
      }
      console.log("\n=== MERGES ===");
      if (ws.model.merges) {
        for (const m of ws.model.merges) console.log("  " + m);
      }
      console.log("\n=== IMAGES ===");
      console.log(ws.getImages().length);
      db.close();
    });
  }).end();
});
