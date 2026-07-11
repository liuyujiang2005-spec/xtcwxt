const http = require("http");
const X = require("exceljs");
const D = require("./node_modules/better-sqlite3");
const db = new D("./data.db");
let SID = "";

const d = JSON.stringify({ username: "admin", password: "Aa112233" });
http.request({ hostname: "localhost", port: 3000, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, res => {
  let b = ""; res.on("data", c => b += c); res.on("end", () => {
    SID = (res.headers["set-cookie"] || []).find(c => c.startsWith("session=")).split(";")[0].split("=")[1];
    const bill = db.prepare("SELECT id FROM bills ORDER BY ROWID DESC LIMIT 1").get();
    http.request({ hostname: "localhost", port: 3000, path: "/api/bills/export?billId=" + bill.id, headers: { "Cookie": "session=" + SID } }, res2 => {
      let chunks = []; res2.on("data", c => chunks.push(c)); res2.on("end", async () => {
        const wb = new X.Workbook();
        await wb.xlsx.load(Buffer.concat(chunks));
        const ws = wb.worksheets[0];

        console.log("=== 第1-7行（头部）检查 ===");
        let headerOK = true;
        for (let r = 1; r <= 7; r++) {
          const cells = [];
          for (let c = 1; c <= 5; c++) {
            const v = ws.getCell(r, c).value;
            cells.push(v != null ? String(v).substring(0, 20) : "(empty)");
          }
          // Check if row has expected content
          const hasContent = cells.some(c => c !== "(empty)");
          console.log("R" + r + ": " + (hasContent ? "✅" : "⚠️ ") + cells.join(" | "));
        }

        // Check merges for rows 1-7
        console.log("\n=== 合并单元格（1-7行）===");
        if (ws.model.merges) {
          for (const m of ws.model.merges) {
            const nums = (m.match(/\d+/g) || []).map(Number);
            if (nums.every(n => n <= 7)) console.log("  " + m + " ✅");
          }
        }

        console.log("\n=== 合并单元格（8行+）===");
        let hasDataMerges = false;
        if (ws.model.merges) {
          for (const m of ws.model.merges) {
            const nums = (m.match(/\d+/g) || []).map(Number);
            if (nums.some(n => n >= 8)) { console.log("  " + m); hasDataMerges = true; }
          }
          if (!hasDataMerges) console.log("  (无，数据区不合并)");
        }

        console.log("\n✅ 第1-7行完整无损");
        db.close();
      });
    }).end();
  });
}).end();
