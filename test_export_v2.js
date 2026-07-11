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
      cb(res.statusCode);
    });
  });
  r.write(d); r.end();
}

login((code) => {
  console.log("Login:", code === 200 ? "OK" : "FAIL " + code);
  
  const bill = db.prepare("SELECT id, bill_no FROM bills ORDER BY ROWID DESC LIMIT 1").get();
  if (!bill) { console.log("No bills in DB"); db.close(); return; }
  console.log("Testing bill:", bill.bill_no, "id:", bill.id);

  const opts = { hostname: "localhost", port: 3000, path: "/api/bills/export?billId=" + bill.id, method: "GET", headers: { "Cookie": "session=" + SID } };
  const req = http.request(opts, res => {
    let chunks = []; res.on("data", c => chunks.push(c)); res.on("end", async () => {
      const buf = Buffer.concat(chunks);
      console.log("Status:", res.statusCode, "Size:", buf.length, "bytes");
      const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B;
      console.log("Valid xlsx:", isXlsx);

      if (isXlsx) {
        const wb2 = new X.Workbook();
        await wb2.xlsx.load(buf);
        const ws = wb2.worksheets[0];
        
        // Check data
        let dataRows = 0, borderOk = true;
        for (let r = 8; r <= Math.min(ws.rowCount, 50); r++) {
          const c1 = ws.getCell(r, 1);
          if (c1.value) dataRows++;
          // Check border on first data row
          if (dataRows === 1) {
            const b = c1.border;
            const hasBorder = b && b.top && b.left;
            if (!hasBorder) borderOk = false;
            console.log("Row 8 border:", JSON.stringify(b));
          }
        }
        console.log("Data rows:", dataRows, "Border OK:", borderOk);
        console.log("Total sheet rows:", ws.rowCount);
        
        // Check footer - search ALL rows after data
        let footerFound = false, bankFound = false, qrFound = false;
        console.log("Footer content:");
        for (let r = dataRows + 8; r <= ws.rowCount; r++) {
          const v1 = String(ws.getCell(r, 1).value || '');
          const v2 = String(ws.getCell(r, 3).value || '');
          if (v1.length > 5) console.log("  R" + r + "C1: " + v1.substring(0, 60));
          if (v2.length > 5) console.log("  R" + r + "C3: " + v2.substring(0, 60));
        }
        const imgs = ws.getImages();
        qrFound = imgs.length > 0;
        console.log("Footer notice:", footerFound ? "YES" : "NO");
        console.log("Bank accounts:", bankFound ? "YES" : "NO");
        console.log("QR code:", qrFound ? "YES (" + imgs.length + ")" : "NO");
        
        // Sample row 8 data
        const sample = [];
        for (let c = 1; c <= 21; c++) {
          sample.push(String(ws.getCell(8, c).value || '-').substring(0, 12));
        }
        console.log("Row 8 sample:", sample.join(" | "));
      }
      db.close();
    });
  });
  req.on("error", e => { console.log("Error:", e.message); db.close(); });
  req.end();
});
