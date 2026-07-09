import ExcelJS from 'exceljs';
import path from 'path';

export interface BillRow {
  日期: string;
  唛头: string;
  仓库: string;
  运输方式: string;
  运单号: string;
  货型: string;
  品名: string;
  尺寸: string;
  件数: number;
  国内单号: string;
  单项体积: number;
  单项重量: number;
  总体积: number;
  总重量: number;
  计费体积: number;
  总计费体积: number;
  单价: number;
  订单总价: number;
  备注: string;
  结算状态: string;
}

const TPL_PATH = path.join(process.cwd(), 'public', 'bill_template.xlsx');

export async function generateBillXlsx(
  _companyName: string,
  _customerName: string,
  _month: string,
  rows: BillRow[],
  _totalCny: number,
  _totalThb: number,
) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.readFile(TPL_PATH); } catch (e) { throw new Error(`账单模板加载失败: ${(e as any)?.message || e}`); }
  const ws = wb.worksheets[0];

  // Clear old data from row 8 onwards
  const totalExisting = ws.rowCount;
  for (let r = 8; r <= totalExisting; r++) {
    for (let c = 1; c <= 21; c++) {
      try { ws.getCell(r, c).value = null; } catch {}
    }
  }

  let currentRow = 7; // data starts at row 8
  for (const row of rows) {
    currentRow++;
    const r = ws.getRow(currentRow);

    const vals: any[] = [
      row.日期,        // 1
      row.唛头,        // 2
      row.仓库,        // 3
      row.运输方式,    // 4
      row.运单号,      // 5
      row.货型,        // 6
      row.品名,        // 7
      row.尺寸,        // 8
      row.件数,        // 9
      row.国内单号,    // 10
      row.单项体积,    // 11
      row.单项重量,    // 12
      row.总体积,      // 13
      row.总重量,      // 14
      row.计费体积,    // 15
      row.总计费体积,  // 16
      row.单价,        // 17
      null,            // 18: 单项价格 = formula Q*O
      row.订单总价,    // 19
      row.备注,        // 20
      row.结算状态,    // 21
    ];

    vals.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      if (v !== null && v !== undefined) cell.value = v;
    });
    r.commit();

    // Col 18 (R): 单项价格 = Q(单价) * O(计费体积)
    const priceCell = r.getCell(18);
    priceCell.value = { formula: `Q${currentRow}*O${currentRow}` };
    priceCell.numFmt = '#,##0.00';

    r.commit();
  }

  // Place new total row after data
  const sumRow = currentRow + 1;
  const rSum = ws.getRow(sumRow);
  rSum.getCell(17).value = '合计';   // Q column
  rSum.getCell(18).value = { formula: `SUM(R8:R${currentRow})` };
  rSum.getCell(18).numFmt = '#,##0.00';
  rSum.getCell(19).value = '泰铢';

  return await wb.xlsx.writeBuffer();
}
