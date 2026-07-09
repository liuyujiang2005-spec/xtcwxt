const X = require("exceljs");
async function main() {
  const wb = new X.Workbook();
  await wb.xlsx.readFile("public/bill_template.xlsx");
  const ws = wb.worksheets[0];
  if (ws.model.merges) {
    const rowMerges = new Set();
    ws.model.merges.forEach(m => {
      const nums = m.match(/\d+/g) || [];
      nums.forEach(n => rowMerges.add(parseInt(n)));
    });
    const mergedRows = [...rowMerges].sort((a,b)=>a-b);
    console.log("Rows involved in merges:", mergedRows.join(", "));
    // Find first non-merged row after headers
    let safe = 1;
    while (rowMerges.has(safe) || safe <= 5) safe++;
    console.log("First safe data row:", safe);
    console.log("Total rows:", ws.rowCount);
  }
}
main().catch(e => console.error(e.message));
