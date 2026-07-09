const http = require("http");
const D = require("./node_modules/better-sqlite3");
const d = new D("./data.db");

// Login to get session cookie
function login(callback) {
  const data = JSON.stringify({ username: "admin", password: "admin123" });
  const opts = {
    hostname: "localhost", port: 3000, path: "/api/auth/login",
    method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length }
  };
  const req = http.request(opts, res => {
    let body = "";
    res.on("data", c => body += c);
    res.on("end", () => {
      const cookies = res.headers["set-cookie"] || [];
      const session = cookies.find(c => c.startsWith("session="));
      const token = session ? session.split(";")[0].split("=")[1] : null;
      console.log("Login status:", res.statusCode, "session:", token ? "OK" : "MISSING");
      callback(token, d);
    });
  });
  req.write(data);
  req.end();
}

function testExport(sessionToken, db) {
  const b = db.prepare("SELECT id, bill_no FROM bills LIMIT 1").get();
  console.log("Bill:", b.bill_no, "id:", b.id);

  const opts = {
    hostname: "localhost", port: 3000, path: "/api/bills/export?billId=" + b.id,
    method: "GET", headers: { "Cookie": "session=" + sessionToken }
  };
  const req = http.request(opts, res => {
    let chunks = [];
    res.on("data", c => chunks.push(c));
    res.on("end", () => {
      const buf = Buffer.concat(chunks);
      console.log("Status:", res.statusCode, "Size:", buf.length, "bytes");
      if (res.statusCode === 200 && buf.length > 2000) {
        const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B;
        console.log("Valid xlsx:", isXlsx);

        const X = require("exceljs");
        const wb2 = new X.Workbook();
        wb2.xlsx.load(buf).then(() => {
          const ws = wb2.worksheets[0];
          let dataCells = 0;
          for (let r = 8; r <= Math.min(ws.rowCount, 500); r++) {
            for (let c = 1; c <= 21; c++) {
              const cell = ws.getCell(r, c);
              if (cell.value !== null && cell.value !== undefined) dataCells++;
            }
          }
          console.log("Data cells in rows 8+:", dataCells);
          console.log("Sheet rows:", ws.rowCount, "cols:", ws.columnCount);
          // Sample row 8
          const r8 = [];
          for (let c = 1; c <= 21; c++) {
            const v = ws.getCell(8, c).value;
            r8.push(v !== null && v !== undefined ? String(v).substring(0, 15) : "-");
          }
          console.log("Row 8:", r8.join(" | "));
          db.close();
        });
      } else {
        console.log("Body:", buf.toString().substring(0, 300));
        db.close();
      }
    });
  });
  req.on("error", e => { console.log("Error:", e.message); db.close(); });
  req.end();
}

login(testExport);
