const X = require("exceljs");
async function main() {
  const wb = new X.Workbook();
  await wb.xlsx.readFile("public/bill_template.xlsx");
  const ws = wb.worksheets[0];
  console.log("Sheet:", ws.name, "rows:", ws.rowCount, "cols:", ws.columnCount);
  for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
    const row = ws.getRow(r);
    const vals = [];
    row.eachCell(c => {
      if (c.value !== null && c.value !== undefined && String(c.value) !== "")
        vals.push(c.col + "=" + String(c.value).substring(0, 50));
    });
    if (vals.length) console.log("Row", r, ":", vals.join(" | "));
  }
  console.log("Merges:", ws.model.merges ? ws.model.merges.length : 0);
  const imgs = ws.getImages();
  console.log("Images:", imgs.length);
}
main().catch(e => console.error(e.message));
