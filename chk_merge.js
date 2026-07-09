const X = require("exceljs");
async function main() {
  const wb = new X.Workbook();
  await wb.xlsx.readFile("public/bill_template.xlsx");
  const ws = wb.worksheets[0];
  if (ws.model.merges) {
    ws.model.merges.slice(0, 5).forEach(m => {
      console.log("merge:", JSON.stringify(m));
    });
    console.log("Total merges:", ws.model.merges.length);
  }
}
main().catch(e => console.error(e.message));
