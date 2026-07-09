const X = require("exceljs");
const http = require("http");
const D = require("./node_modules/better-sqlite3");
const d = new D("./data.db");

const b = d.prepare("SELECT id, bill_no FROM bills LIMIT 1").get();
console.log("Testing bill:", b.bill_no, "id:", b.id);

const opts = { hostname: "localhost", port: 3000, path: "/api/bills/export?billId=" + b.id, method: "GET" };
const req = http.request(opts, res => {
  let chunks = [];
  res.on("data", c => chunks.push(c));
  res.on("end", () => {
    const buf = Buffer.concat(chunks);
    console.log("Status:", res.statusCode, "Size:", buf.length, "bytes");
    if (res.statusCode === 200 && buf.length > 2000) {
      // Check if it's a valid xlsx
      const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B;
      console.log("Valid xlsx:", isXlsx);

      // Read back and check row count
      const wb2 = new X.Workbook();
      wb2.xlsx.load(buf).then(() => {
        const ws = wb2.worksheets[0];
        console.log("Sheets:", wb2.worksheets.length);
        let dataRows = 0;
        for (let r = 8; r <= ws.rowCount; r++) {
          const cell = ws.getCell(r, 1);
          if (cell.value) dataRows++;
        }
        console.log("Data rows (col 1 non-empty from row 8):", dataRows);
        console.log("Total rows in sheet:", ws.rowCount);
        d.close();
      }).catch(e => console.error("Read error:", e.message));
    } else {
      console.log("Body:", buf.toString().substring(0, 300));
      d.close();
    }
  });
});
req.on("error", e => { console.log("Error:", e.message); d.close(); });
req.end();
