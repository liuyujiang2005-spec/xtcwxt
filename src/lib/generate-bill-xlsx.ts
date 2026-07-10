import ExcelJS from 'exceljs';
import path from 'path';

export interface BillRow {
  日期: string; 唛头: string; 仓库: string; 运输方式: string; 运单号: string;
  货型: string; 品名: string; 尺寸: string; 件数: number; 国内单号: string;
  单项体积: number; 单项重量: number; 总体积: number; 总重量: number;
  计费体积: number; 总计费体积: number; 单价: number; 订单总价: number;
  备注: string; 结算状态: string;
}

const TPL_PATH = path.join(process.cwd(), 'public', 'bill_template.xlsx');
const FONT = '宋体';
const THIN = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };

export async function generateBillXlsx(
  _companyName: string, _customerName: string, _month: string,
  rows: BillRow[], _totalCny: number, _totalThb: number,
) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.readFile(TPL_PATH); } catch (e) { throw new Error(`账单模板加载失败: ${(e as any)?.message || e}`); }
  const ws = wb.worksheets[0];

  // Save QR code image buffer
  let imgBuf: Buffer | null = null;
  try {
    const media = (wb as any).model?.media;
    if (media && media.length > 0) imgBuf = media[0].buffer;
  } catch {}

  // Clear all merge cells
  if (ws.model.merges) {
    const merges = [...(ws.model.merges as any[])];
    for (const m of merges) {
      try { ws.unMergeCells(m); } catch {}
    }
  }

  // Clear all old images
  (ws as any).model.drawings = [];

  // Remove old data and footer rows (row 8 onwards)
  const totalRows = ws.rowCount;
  for (let r = 8; r <= totalRows; r++) {
    for (let c = 1; c <= 21; c++) {
      try { ws.getCell(r, c).value = null; } catch {}
    }
  }

  // ── Write data rows from row 8 ──
  let currentRow = 7;
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
      cell.font = { name: FONT, size: 11 };
      cell.border = THIN;
      cell.alignment = { vertical: 'middle' };
    });

    const priceCell = r.getCell(18);
    priceCell.value = { formula: `Q${currentRow}*O${currentRow}` };
    priceCell.numFmt = '#,##0.00';
    priceCell.font = { name: FONT, size: 11 };
    priceCell.border = THIN;
    priceCell.alignment = { vertical: 'middle' };
  }

  // ── Total row ──
  const sumRow = currentRow + 1;
  const rSum = ws.getRow(sumRow);
  rSum.getCell(17).value = '合计';
  rSum.getCell(17).font = { name: FONT, size: 11, bold: true };
  rSum.getCell(18).value = { formula: `SUM(R8:R${currentRow})` };
  rSum.getCell(18).numFmt = '#,##0.00';
  rSum.getCell(18).font = { name: FONT, size: 11, bold: true };
  rSum.getCell(19).value = '泰铢';
  rSum.getCell(19).font = { name: FONT, size: 11, bold: true };
  for (let c = 1; c <= 21; c++) {
    rSum.getCell(c).border = THIN;
  }

  // ── Rebuild footer ──
  const footerRow = sumRow + 2;

  // Notice text
  ws.mergeCells(footerRow, 1, footerRow, 21);
  const noticeCell = ws.getCell(footerRow, 1);
  noticeCell.value = '如有疑问请在两个工作日之内提出反馈，以便于我们及时核实，修改账单。确认金额后请及时安排付款，以免影响贵司货物运输时效。感谢您的配合，合作愉快！';
  noticeCell.font = { name: FONT, size: 11, bold: true };
  noticeCell.alignment = { vertical: 'middle', wrapText: true, horizontal: 'center' };
  ws.getRow(footerRow).height = 30;

  // Bank header
  const bankHdrRow = footerRow + 2;
  ws.mergeCells(bankHdrRow, 1, bankHdrRow, 2);
  ws.getCell(bankHdrRow, 1).value = '人民币收款账户';
  ws.getCell(bankHdrRow, 1).font = { name: FONT, size: 11, bold: true };
  ws.getCell(bankHdrRow, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getCell(bankHdrRow, 1).border = THIN;
  ws.getCell(bankHdrRow, 2).border = THIN;

  ws.mergeCells(bankHdrRow, 3, bankHdrRow, 4);
  ws.getCell(bankHdrRow, 3).value = '泰铢收款账户';
  ws.getCell(bankHdrRow, 3).font = { name: FONT, size: 11, bold: true };
  ws.getCell(bankHdrRow, 3).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getCell(bankHdrRow, 3).border = THIN;
  ws.getCell(bankHdrRow, 4).border = THIN;

  ws.mergeCells(bankHdrRow, 5, bankHdrRow, 10);
  ws.getCell(bankHdrRow, 5).value = '微信支付宝收款码';
  ws.getCell(bankHdrRow, 5).font = { name: FONT, size: 11, bold: true };
  ws.getCell(bankHdrRow, 5).alignment = { vertical: 'middle', horizontal: 'center' };
  for (let c = 5; c <= 10; c++) ws.getCell(bankHdrRow, c).border = THIN;

  ws.mergeCells(bankHdrRow, 11, bankHdrRow, 14);
  ws.getCell(bankHdrRow, 11).value = '公户收款账号';
  ws.getCell(bankHdrRow, 11).font = { name: FONT, size: 11, bold: true };
  ws.getCell(bankHdrRow, 11).alignment = { vertical: 'middle', horizontal: 'center' };
  for (let c = 11; c <= 14; c++) ws.getCell(bankHdrRow, c).border = THIN;

  // Bank data
  const bankDataRow = bankHdrRow + 1;
  ws.getRow(bankDataRow).height = 80;

  ws.mergeCells(bankDataRow, 1, bankDataRow, 2);
  ws.getCell(bankDataRow, 1).value = '621226 3602123327850 刘雄\n工商银行广州江南市场支行';
  ws.getCell(bankDataRow, 1).font = { name: FONT, size: 9 };
  ws.getCell(bankDataRow, 1).alignment = { vertical: 'top', wrapText: true };
  ws.getCell(bankDataRow, 1).border = THIN;
  ws.getCell(bankDataRow, 2).border = THIN;

  ws.mergeCells(bankDataRow, 3, bankDataRow, 4);
  ws.getCell(bankDataRow, 3).value = 'scb\n4301138403 Xiong liu\nSWIFT: SICOTHBK';
  ws.getCell(bankDataRow, 3).font = { name: FONT, size: 9 };
  ws.getCell(bankDataRow, 3).alignment = { vertical: 'top', wrapText: true };
  ws.getCell(bankDataRow, 3).border = THIN;
  ws.getCell(bankDataRow, 4).border = THIN;

  ws.mergeCells(bankDataRow, 11, bankDataRow, 14);
  ws.getCell(bankDataRow, 11).value = '暹联出海企业管理咨询(深圳)有限公司\n41015400040090685\n中国农业银行深圳蛇口支行';
  ws.getCell(bankDataRow, 11).font = { name: FONT, size: 9 };
  ws.getCell(bankDataRow, 11).alignment = { vertical: 'top', wrapText: true };
  for (let c = 11; c <= 14; c++) ws.getCell(bankDataRow, c).border = THIN;

  // QR code image
  if (imgBuf) {
    try {
      const imgId = wb.addImage({ buffer: imgBuf as any, extension: 'png' });
      ws.addImage(imgId, { tl: { col: 5, row: bankDataRow - 1 }, ext: { width: 180, height: 180 } });
    } catch {}
  }

  return await wb.xlsx.writeBuffer();
}
