const http = require("http"); const X = require("exceljs"); const D = require("./node_modules/better-sqlite3"); const db = new D("./data.db");

function login(pw, cb) {
  const d = JSON.stringify({ username: "admin", password: pw });
  const r = http.request({ hostname: "localhost", port: 3000, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, res => {
    let b = ""; res.on("data", c => b += c); res.on("end", () => {
      const sc = (res.headers["set-cookie"] || []).find(c => c.startsWith("session="));
      cb(sc ? sc.split(";")[0].split("=")[1] : null);
    });
  });
  r.on("error", () => cb(null));
  r.write(d); r.end();
}

login("Aa112233", sid => {
  if (!sid) { db.close(); return; }
  const bi = db.prepare("SELECT id FROM bills LIMIT 1").get();
  if (!bi) { db.close(); return; }
  http.request({ hostname: "localhost", port: 3000, path: "/api/bills/export?billId=" + bi.id, headers: { "Cookie": "session=" + sid } }, res => {
    let cks = []; res.on("data", c => cks.push(c)); res.on("end", async () => {
      const wb = new X.Workbook(); await wb.xlsx.load(Buffer.concat(cks)); const ws = wb.worksheets[0];
      let mergeCnt = 0;
      if (ws.model.merges) {
        for (const m of ws.model.merges) {
          const ns = (m.match(/\d+/g) || []).map(Number);
          if (ns.some(n => n >= 8)) mergeCnt++;
        }
      }
      console.log("Data-area merges:", mergeCnt);
      // Show first 4 rows of data
      for (let r = 8; r <= 12; r++) {
        console.log("R" + r + " C1=" + ws.getCell(r, 1).value + " | C6=" + ws.getCell(r, 6).value + " | C7=" + ws.getCell(r, 7).value);
      }
      db.close();
    });
  }).on("error", () => db.close()).end();
});
