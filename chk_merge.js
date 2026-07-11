const http = require("http"); const X = require("exceljs"); const D = require("./node_modules/better-sqlite3"); const db = new D("./data.db");
const d = JSON.stringify({ username: "admin", password: "Aa112233" });
http.request({ hostname: "localhost", port: 3000, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, res => {
  let b = ""; res.on("data", c => b += c); res.on("end", () => {
    const sid = (res.headers["set-cookie"] || []).find(c => c.startsWith("session=")).split(";")[0].split("=")[1];
    const bi = db.prepare("SELECT id FROM bills ORDER BY ROWID DESC LIMIT 1").get();
    http.request({ hostname: "localhost", port: 3000, path: "/api/bills/export?billId=" + bi.id, headers: { "Cookie": "session=" + sid } }, async res2 => {
      let cks = []; res2.on("data", c => cks.push(c)); res2.on("end", async () => {
        const wb = new X.Workbook(); await wb.xlsx.load(Buffer.concat(cks)); const ws = wb.worksheets[0];
        console.log("数据区合并单元格:");
        let cnt = 0;
        if (ws.model.merges) {
          for (const m of ws.model.merges) {
            const ns = (m.match(/\d+/g) || []).map(Number);
            if (ns.some(n => n >= 8)) { console.log("  " + m); cnt++; }
          }
        }
        console.log("共", cnt, "个合并");
        console.log("R8C1(head):", ws.getCell(8, 1).value, "| R9C1:", ws.getCell(9, 1).value);
        console.log("R8C6(detail):", ws.getCell(8, 6).value, "| R9C6:", ws.getCell(9, 6).value);
        db.close();
      });
    }).end();
  });
}).end();
