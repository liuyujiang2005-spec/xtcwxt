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

  // ── Save footer content (row 13+) before clearing ──
  const footerData: { row: number; cells: { col: number; value: any; style?: any }[] }[] = [];
  const footerMerges: string[] = [];
  const totalExisting = ws.rowCount;

  for (let r = 13; r <= totalExisting; r++) {
    const row = ws.getRow(r);
    const cells: { col: number; value: any }[] = [];
    row.eachCell((cell, col) => {
      if (cell.value !== null && cell.value !== undefined) {
        cells.push({ col, value: cell.value });
      }
    });
    if (cells.length > 0) footerData.push({ row: r, cells });
  }

  // Save merge ranges that involve rows 13+
  if (ws.model.merges) {
    for (const m of ws.model.merges as string[]) {
      const nums = (m.match(/\d+/g) || []).map(Number);
      if (nums.some((n: number) => n >= 13)) {
        footerMerges.push(m);
      }
    }
  }

  // ── Clear data area (rows 8-12 only, keep footer) ──
  for (let r = 8; r <= Math.min(12, totalExisting); r++) {
    for (let c = 1; c <= 21; c++) {
      try { ws.getCell(r, c).value = null; } catch {}
    }
  }

  // ── Write data rows ──
  let currentRow = 7; // data starts at row 8
  for (const row of rows) {
    currentRow++;
    const r = ws.getRow(currentRow);

    const vals: any[] = [
      row.日期, row.唛头, row.仓库, row.运输方式, row.运单号,
      row.货型, row.品名, row.尺寸, row.件数, row.国内单号,
      row.单项体积, row.单项重量, row.总体积, row.总重量,
      row.计费体积, row.总计费体积, row.单价,
      null, row.订单总价, row.备注, row.结算状态,
    ];

    vals.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      if (v !== null && v !== undefined) cell.value = v;
    });
    r.commit();

    const priceCell = r.getCell(18);
    priceCell.value = { formula: `Q${currentRow}*O${currentRow}` };
    priceCell.numFmt = '#,##0.00';
    r.commit();
  }

  // ── Total row ──
  const sumRow = currentRow + 1;
  const rSum = ws.getRow(sumRow);
  rSum.getCell(17).value = '合计';
  rSum.getCell(18).value = { formula: `SUM(R8:R${currentRow})` };
  rSum.getCell(18).numFmt = '#,##0.00';

  // ── Paste footer after total row ──
  const footerStart = sumRow + 2;
  const rowOffset = footerStart - 13;

  for (const fd of footerData) {
    const targetRow = fd.row + rowOffset;
    for (const c of fd.cells) {
      ws.getCell(targetRow, c.col).value = c.value;
    }
  }

  // Re-apply merge ranges with offset
  for (const m of footerMerges) {
    const nums = m.match(/\d+/g) || [];
    if (nums.length >= 2) {
      const top = parseInt(nums[0] || '0') + rowOffset;
      const bottom = parseInt(nums[1] || '0') + rowOffset;
      const cols = (m.match(/[A-Z]+/g) || []) as string[];
      if (cols.length >= 2 && cols[0] && cols[1]) {
        try {
          ws.mergeCells(cols[0] + top + ':' + cols[1] + bottom);
        } catch {}
      }
    }
  }

  return await wb.xlsx.writeBuffer();
}
