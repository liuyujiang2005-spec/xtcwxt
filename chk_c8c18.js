const http = require("http"); const X = require("exceljs"); const D = require("./node_modules/better-sqlite3"); const db = new D("./data.db");
function login(pw, cb) {
  const d = JSON.stringify({ username: "admin", password: pw });
  const r = http.request({ hostname: "localhost", port: 3000, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, res => {
    let b = ""; res.on("data", c => b += c); res.on("end", () => {
      const sc = (res.headers["set-cookie"] || []).find(c => c.startsWith("session="));
      cb(sc ? sc.split(";")[0].split("=")[1] : null);
    });
  }); r.write(d); r.end();
}
login("Aa112233", sid => {
  const bi = db.prepare("SELECT id FROM bills LIMIT 1").get();
  http.request({ hostname: "localhost", port: 3000, path: "/api/bills/export?billId=" + bi.id, headers: { "Cookie": "session=" + sid } }, res => {
    let c = []; res.on("data", d => c.push(d)); res.on("end", async () => {
      const wb = new X.Workbook(); await wb.xlsx.load(Buffer.concat(c)); const ws = wb.worksheets[0];
      console.log("C8 (尺寸 C18 (单项价格) check:");
      for (let r = 8; r <= Math.min(ws.rowCount, 20); r++) {
        const c8 = ws.getCell(r, 8).value;
        const c18 = ws.getCell(r, 18).value;
        const c8v = c8 != null ? (typeof c8 === 'object' ? JSON.stringify(c8).substring(0,20) : String(c8).substring(0, 8)) : "NULL";
        const c18v = c18 != null ? (c18.formula ? "F:" + c18.formula : typeof c18 === 'number' ? c18 : "OBJ") : "NULL";
        console.log("R" + r + " C8=" + c8v.padEnd(10) + " C18=" + c18v);
      }
      db.close();
    });
  }).end();
});
