const X = require("exceljs");
async function main() {
  const wb = new X.Workbook();
  await wb.xlsx.readFile("public/bill_template.xlsx");
  const ws = wb.worksheets[0];
  for (let r = 9; r <= 15; r++) {
    const row = ws.getRow(r);
    const vals = [];
    row.eachCell(c => {
      let v = c.value;
      if (v && typeof v === "object" && v.formula) v = "F:" + v.formula;
      if (v !== null && v !== undefined) vals.push(c.col + "=" + String(v).substring(0, 60));
    });
    console.log("Row", r, ":", vals.join(" | ") || "(empty)");
  }
  for (let r = 1; r <= 12; r++) {
    const h = ws.getRow(r).height;
    if (h) console.log("Row", r, "height:", h);
  }
  // Check last rows for bank info
  for (const r of [36, 37, 38, 39, 40, 41]) {
    const row = ws.getRow(r);
    const vals = [];
    row.eachCell(c => { if (c.value) vals.push(c.col + "=" + String(c.value).substring(0, 60)); });
    if (vals.length) console.log("Row", r, ":", vals.join(" | "));
  }
  console.log("Total rows:", ws.rowCount);
}
main().catch(e => console.error(e.message));
