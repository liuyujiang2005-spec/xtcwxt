const X = require("exceljs");
async function main() {
  const wb = new X.Workbook();
  await wb.xlsx.readFile("public/bill_template.xlsx");
  const ws = wb.worksheets[0];

  console.log("=== Footer cells (rows 13+) ===");
  for (let r = 13; r <= ws.rowCount; r++) {
    for (let c = 1; c <= 21; c++) {
      const cell = ws.getCell(r, c);
      if (cell.value != null && String(cell.value) !== '') {
        console.log("  R" + r + "C" + c + " = " + String(cell.value).substring(0, 50));
      }
    }
  }

  console.log("\n=== Footer merges (rows 13+) ===");
  if (ws.model.merges) {
    for (const m of ws.model.merges) {
      const nums = (m.match(/\d+/g) || []).map(Number);
      if (nums.some(n => n >= 13)) console.log("  " + m);
    }
  }

  console.log("\n=== QR ===");
  try { console.log("wb media:", ((wb.model || {}).media || []).length); } catch(e) {}
  try { console.log("ws media:", ((ws.model || {}).media || []).length); } catch(e) {}
  try { console.log("ws drawings:", ((ws.model || {}).drawings || []).length); } catch(e) {}
  const imgs = ws.getImages();
  console.log("ws.getImages():", imgs.length);
}
main();
