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
const BI = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };

export async function generateBillXlsx(
  _a: string, _b: string, _c: string, rows: BillRow[], _d: number, _e: number,
) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.readFile(TPL_PATH); } catch (e) { throw new Error(`模板加载失败: ${(e as any)?.message || e}`); }
  const ws = wb.worksheets[0];

  // ── Save QR code ──
  let qrBuf: Buffer | null = null;
  try { const m = (wb as any).model?.media; if (m?.length) qrBuf = m[0].buffer; } catch {}

  // ── Read footer from template ──
  const footerNotice = String((ws.getCell(13, 1).value || '')).trim() || '如有疑问请在两个工作日之内提出反馈，以便于我们及时核实，修改账单。确认金额后请及时安排付款，以免影响贵司货物运输时效。感谢您的配合，合作愉快！';
  const bankHdrCny = String((ws.getCell(15, 1).value || '')).trim() || '人民币收款账户';
  const bankHdrThb = String((ws.getCell(15, 3).value || '')).trim() || '泰铢收款账户';
  const bankHdrWx = String((ws.getCell(15, 5).value || '')).trim() || '微信支付宝收款码';
  const bankHdrPublic = String((ws.getCell(15, 11).value || '')).trim() || '公户收款账号';
  const bankCny = (String(ws.getCell(16, 1).value || '')).trim() || '621226 3602123327850 刘雄\n工商银行广州江南市场支行';
  const bankThb = (String(ws.getCell(16, 3).value || '')).trim() || 'scb\n4301138403 Xiong liu\nSWIFT: SICOTHBK';
  const bankPublic = (String(ws.getCell(16, 11).value || '')).trim() || '暹联出海企业管理咨询(深圳)有限公司\n41015400040090685\n中国农业银行深圳蛇口支行';

  // ── Only unmerge + clear rows 8+ ──
  if (ws.model.merges) {
    const toRemove: string[] = [];
    for (const m of ws.model.merges as string[]) {
      if ((m.match(/\d+/g) || []).map(Number).some(n => n >= 8)) toRemove.push(m);
    }
    for (const m of toRemove) { try { ws.unMergeCells(m); } catch {} }
  }
  (ws as any).model.drawings = [];
  (ws as any).model.media = [];

  for (let r = 8; r <= Math.max(ws.rowCount, 20); r++) {
    for (let c = 1; c <= 21; c++) {
      try { const cell = ws.getCell(r, c); cell.value = null; cell.border = {}; cell.font = {}; } catch {}
    }
  }

  // ── Sort rows by 运单号 for grouping ──
  rows.sort((a, b) => a.运单号.localeCompare(b.运单号));

  // ── Write data rows (row 8+) ──
  let cr = 7;
  for (const row of rows) {
    cr++;
    const r = ws.getRow(cr);
    const vals = [row.日期, row.唛头, row.仓库, row.运输方式, row.运单号, row.货型, row.品名, row.尺寸, row.件数, row.国内单号, row.单项体积, row.单项重量, row.总体积, row.总重量, row.计费体积, row.总计费体积, row.单价, row.单价 * row.计费体积, row.订单总价, row.备注, row.结算状态];
    for (let c = 1; c <= 21; c++) {
      const cell = r.getCell(c);
      if (vals[c - 1] != null) cell.value = vals[c - 1];
      cell.font = { name: FONT, size: 9 };
      cell.border = BI;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
    const pc = r.getCell(18);
    pc.numFmt = '#,##0.00';
  }

  // ── Merge cells by 运单号 (second pass) ──
  const mergeCols = [1, 2, 3, 4, 5, 13, 14, 16, 19]; // 日期/唛头/仓库/运输/运单号/总体积/总重量/总计费体积/订单总价
  let groupStartRow = 8;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].运单号 !== rows[i - 1].运单号) {
      const groupEndRow = 7 + i; // last row of previous group
      if (groupEndRow > groupStartRow) {
        mergeCols.forEach(col => {
          try { ws.mergeCells(groupStartRow, col, groupEndRow, col); } catch {}
        });
        // Set merged cells alignment to center
        for (let r = groupStartRow; r <= groupEndRow; r++) {
          mergeCols.forEach(col => {
            try { ws.getCell(r, col).alignment = { vertical: 'middle', horizontal: 'center' }; } catch {}
          });
        }
      }
      groupStartRow = 7 + i + 1; // next group starts here
    }
  }
  // Merge last group
  if (cr > groupStartRow) {
    mergeCols.forEach(col => {
      try { ws.mergeCells(groupStartRow, col, cr, col); } catch {}
    });
    for (let r = groupStartRow; r <= cr; r++) {
      mergeCols.forEach(col => {
        try { ws.getCell(r, col).alignment = { vertical: 'middle', horizontal: 'center' }; } catch {}
      });
    }
  }

  // ── Total row ──
  const sr = cr + 1;
  const sRow = ws.getRow(sr);
  sRow.getCell(17).value = '合计'; sRow.getCell(17).font = { name: FONT, size: 11, bold: true };
  sRow.getCell(18).value = { formula: `SUM(R8:R${cr})` }; sRow.getCell(18).font = { name: FONT, size: 11, bold: true }; sRow.getCell(18).numFmt = '#,##0.00';
  for (let c = 1; c <= 21; c++) sRow.getCell(c).border = BI;

  // ── Rebuild footer ──
  const fr = sr + 2;
  ws.mergeCells(fr, 1, fr + 1, 12);
  ws.getCell(fr, 1).value = footerNotice;
  ws.getCell(fr, 1).font = { name: FONT, size: 11, bold: true };
  ws.getCell(fr, 1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  ws.getRow(fr).height = 28;

  const br = fr + 3;
  const bh = (c1: number, c2: number, text: string) => {
    ws.mergeCells(br, c1, br, c2);
    ws.getCell(br, c1).value = text;
    ws.getCell(br, c1).font = { name: FONT, size: 11, bold: true };
    ws.getCell(br, c1).alignment = { vertical: 'middle', horizontal: 'center' };
    for (let c = c1; c <= c2; c++) ws.getCell(br, c).border = BI;
  };
  bh(1, 2, bankHdrCny); bh(3, 4, bankHdrThb); bh(5, 10, bankHdrWx); bh(11, 14, bankHdrPublic);

  const bd = br + 1;
  ws.getRow(bd).height = 75;
  const bv = (c1: number, c2: number, text: string) => {
    ws.mergeCells(bd, c1, bd, c2);
    ws.getCell(bd, c1).value = text;
    ws.getCell(bd, c1).font = { name: FONT, size: 9 };
    ws.getCell(bd, c1).alignment = { vertical: 'top', wrapText: true };
    for (let c = c1; c <= c2; c++) ws.getCell(bd, c).border = BI;
  };
  bv(1, 2, bankCny); bv(3, 4, bankThb); bv(11, 14, bankPublic);

  if (qrBuf) {
    try {
      const imgId = wb.addImage({ buffer: qrBuf as any, extension: 'png' });
      ws.addImage(imgId, { tl: { col: 5, row: br - 0.5 }, ext: { width: 180, height: 180 } });
    } catch {}
  }

  return await wb.xlsx.writeBuffer();
}
