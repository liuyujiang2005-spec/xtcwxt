const http = require("http"); const X = require("exceljs"); const D = require("./node_modules/better-sqlite3"); const db = new D("./data.db");
const d = JSON.stringify({ username: "admin", password: "Aa112233" });
http.request({ hostname: "localhost", port: 3000, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, res => {
  let b = ""; res.on("data", c => b += c); res.on("end", () => {
    const sid = (res.headers["set-cookie"] || []).find(c => c.startsWith("session=")).split(";")[0].split("=")[1];
    const bi = db.prepare("SELECT id FROM bills LIMIT 1").get();
    http.request({ hostname: "localhost", port: 3000, path: "/api/bills/export?billId=" + bi.id, headers: { "Cookie": "session=" + sid } }, async res2 => {
      let cks = []; res2.on("data", d => cks.push(d)); res2.on("end", async () => {
        const wb = new X.Workbook(); await wb.xlsx.load(Buffer.concat(cks)); const ws = wb.worksheets[0];
        for (let r = 8; r <= 10; r++) {
          const c8 = ws.getCell(r, 8); const c17 = ws.getCell(r, 17); const c18 = ws.getCell(r, 18); const c19 = ws.getCell(r, 19);
          console.log("R" + r + " C8(尺寸)=" + (c8.value || "empty") + " | C17(单价)=" + (c17.value || "0") + " | C18(单项价)=" + (c18.value || "0") + " | C19(订单总价)=" + (c19.value || "0") + " | align=" + c8.alignment.horizontal + "/" + c8.alignment.vertical);
        }
        db.close();
      });
    }).end();
  });
}).end();
