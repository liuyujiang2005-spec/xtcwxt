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
const FONT_NAME = '宋体';

// ── 统一行高：每条品名行固定 22 点，视觉上宽松清晰 ──
const DATA_ROW_HEIGHT = 22;

// ── 边框样式 ──
const BORDER_THIN = {
  top:    { style: 'thin' as const },
  left:   { style: 'thin' as const },
  bottom: { style: 'thin' as const },
  right:  { style: 'thin' as const },
};

// ── 列宽配置（单位：字符宽度），按内容长度合理分配 ──
const COL_WIDTHS: Record<number, number> = {
  1:  10,  // 日期
  2:  12,  // 唛头
  3:  8,   // 仓库
  4:  8,   // 运输方式
  5:  14,  // 运单号
  6:  8,   // 货型
  7:  18,  // 品名 ← 适当加宽，内容最多
  8:  12,  // 尺寸
  9:  6,   // 件数
  10: 14,  // 国内单号
  11: 8,   // 单项体积
  12: 8,   // 单项重量
  13: 8,   // 总体积
  14: 8,   // 总重量
  15: 8,   // 计费体积
  16: 10,  // 总计费体积
  17: 8,   // 单价
  18: 10,  // 单价×计费
  19: 10,  // 订单总价
  20: 12,  // 备注
  21: 8,   // 结算状态
};

// ── 数字列：右对齐 ──
const NUMBER_COLS = new Set([9, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

export async function generateBillXlsx(
  _a: string, _b: string, _c: string, rows: BillRow[], totalReceivable: number, _e: number,
) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(TPL_PATH);
  } catch (e) {
    throw new Error(`模板加载失败: ${(e as any)?.message || e}`);
  }
  const ws = wb.worksheets[0];

  // ── 保存 QR 图片 ──
  let qrBuf: Buffer | null = null;
  try {
    const m = (wb as any).model?.media;
    if (m?.length) qrBuf = m[0].buffer;
  } catch (e: any) { console.warn('generate-bill-xlsx:', e?.message) }

  // ── 读取模板页脚 ──
  const footerNotice  = String(ws.getCell(13, 1).value  || '').trim() || '如有疑问请在两个工作日之内提出反馈，以便于我们及时核实，修改账单。确认金额后请及时安排付款，以免影响贵司货物运输时效。感谢您的配合，合作愉快！';
  const bankHdrCny    = String(ws.getCell(15, 1).value  || '').trim() || '人民币收款账户';
  const bankHdrThb    = String(ws.getCell(15, 3).value  || '').trim() || '泰铢收款账户';
  const bankHdrWx     = String(ws.getCell(15, 5).value  || '').trim() || '微信支付宝收款码';
  const bankHdrPublic = String(ws.getCell(15, 11).value || '').trim() || '公户收款账号';
  const bankCny       = String(ws.getCell(16, 1).value  || '').trim() || '621226 3602123327850 刘雄\n工商银行广州江南市场支行';
  const bankThb       = String(ws.getCell(16, 3).value  || '').trim() || 'scb\n4301138403 Xiong liu\nSWIFT: SICOTHBK';
  const bankPublic    = String(ws.getCell(16, 11).value || '').trim() || '暹联出海企业管理咨询(深圳)有限公司\n41015400040090685\n中国农业银行深圳蛇口支行';

  // ── 清除第 8 行以下内容和合并 ──
  if (ws.model.merges) {
    const toRemove: string[] = [];
    for (const m of ws.model.merges as string[]) {
      if ((m.match(/\d+/g) || []).map(Number).some(n => n >= 8)) toRemove.push(m);
    }
    for (const m of toRemove) { try { ws.unMergeCells(m); } catch (e: any) { console.warn('generate-bill-xlsx:', e?.message) } }
  }
  (ws as any).model.drawings = [];
  (ws as any).model.media = [];
  for (let r = 8; r <= Math.max(ws.rowCount, 30); r++) {
    for (let c = 1; c <= 21; c++) {
      try {
        const cell = ws.getCell(r, c);
        cell.value = null; cell.border = {}; cell.font = {};
      } catch (e: any) { console.warn('generate-bill-xlsx:', e?.message) }
    }
  }

  // ── 应用列宽 ──
  for (const [col, width] of Object.entries(COL_WIDTHS)) {
    ws.getColumn(Number(col)).width = width;
  }

  // ── 按运单号排序并分组 ──
  rows.sort((a, b) => (a.运单号 ?? '').localeCompare(b.运单号 ?? ''));

  type Group = { 运单号: string; rows: BillRow[] };
  const groups: Group[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.运单号 === row.运单号) {
      last.rows.push(row);
    } else {
      groups.push({ 运单号: row.运单号, rows: [row] });
    }
  }

  // ── 写入数据行 ──
  let cr = 7;

  // 交替背景色：同一运单号用同一底色，相邻运单号交替，一目了然
  const GROUP_COLORS = ['FFFFFF', 'F0F4FA']; // 白 / 浅蓝灰
  let colorIdx = 0;

  // 合并列（跨品名行合并，品名和尺寸列不合并）
  const MERGE_COLS = [1, 2, 3, 4, 5, 13, 14, 16, 19];

  for (const group of groups) {
    const groupStartRow = cr + 1;
    const count = group.rows.length;
    const bgColor = GROUP_COLORS[colorIdx % 2];
    colorIdx++;

    for (let i = 0; i < count; i++) {
      const row = group.rows[i];
      cr++;
      const exRow = ws.getRow(cr);
      exRow.height = DATA_ROW_HEIGHT; // 统一行高

      const vals = [
        row.日期, row.唛头, row.仓库, row.运输方式, row.运单号,
        row.货型, row.品名, row.尺寸, row.件数, row.国内单号,
        row.单项体积, row.单项重量, row.总体积, row.总重量,
        row.计费体积, row.总计费体积, row.单价,
        (isFinite(row.单价) && isFinite(row.计费体积) ? row.单价 * row.计费体积 : null), i === 0 ? row.订单总价 : null,
        row.备注, row.结算状态,
      ];

      for (let c = 1; c <= 21; c++) {
        const cell = exRow.getCell(c);
        if (vals[c - 1] != null) cell.value = vals[c - 1];

        cell.font = { name: FONT_NAME, size: 10 }; // 字号从 9 调到 10，更易读
        cell.border = BORDER_THIN;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF' + bgColor },
        };
        // 数字列右对齐，文字列居中
        cell.alignment = {
          vertical: 'middle',
          horizontal: NUMBER_COLS.has(c) ? 'right' : 'center',
          wrapText: false,
        };
      }

      // 单价×计费 和 订单总价 保留两位小数
      exRow.getCell(18).numFmt = '#,##0.00';
      exRow.getCell(19).numFmt = '#,##0.00';
    }

    const groupEndRow = cr;

    // 合并同运单号内的非品名列
    if (groupEndRow > groupStartRow) {
      for (const col of MERGE_COLS) {
        try { ws.mergeCells(groupStartRow, col, groupEndRow, col); } catch (e: any) { console.warn('generate-bill-xlsx:', e?.message) }
      }
    }
    // 合并后设置垂直居中
    for (const col of MERGE_COLS) {
      try {
        ws.getCell(groupStartRow, col).alignment = {
          vertical: 'middle',
          horizontal: NUMBER_COLS.has(col) ? 'right' : 'center',
          wrapText: false,
        };
      } catch (e: any) { console.warn('generate-bill-xlsx:', e?.message) }
    }
  }

  // ── 合计行 ──
  const sr = cr + 1;
  const sRow = ws.getRow(sr);
  sRow.height = DATA_ROW_HEIGHT + 2;

  // 合计行整行浅黄背景，突出显示
  for (let c = 1; c <= 21; c++) {
    const cell = sRow.getCell(c);
    cell.border = BORDER_THIN;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };
  }
  ws.mergeCells(sr, 1, sr, 16);
  sRow.getCell(1).value = '合　计';
  sRow.getCell(1).font = { name: FONT_NAME, size: 11, bold: true };
  sRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  sRow.getCell(19).value = totalReceivable;
  sRow.getCell(19).font = { name: FONT_NAME, size: 11, bold: true };
  sRow.getCell(19).numFmt = '#,##0.00';
  sRow.getCell(19).alignment = { vertical: 'middle', horizontal: 'right' };

  // ── 页脚通知 ──
  const fr = sr + 2;
  ws.mergeCells(fr, 1, fr + 1, 12);
  ws.getCell(fr, 1).value = footerNotice;
  ws.getCell(fr, 1).font = { name: FONT_NAME, size: 10, bold: true };
  ws.getCell(fr, 1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  ws.getRow(fr).height = 32;

  // ── 收款账户 ──
  const br = fr + 3;
  const bh = (c1: number, c2: number, text: string) => {
    ws.mergeCells(br, c1, br, c2);
    const cell = ws.getCell(br, c1);
    cell.value = text;
    cell.font = { name: FONT_NAME, size: 11, bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    for (let c = c1; c <= c2; c++) ws.getCell(br, c).border = BORDER_THIN;
  };
  bh(1, 2, bankHdrCny);
  bh(3, 4, bankHdrThb);
  bh(5, 10, bankHdrWx);
  bh(11, 14, bankHdrPublic);

  const bd = br + 1;
  ws.getRow(bd).height = 80;
  const bv = (c1: number, c2: number, text: string) => {
    ws.mergeCells(bd, c1, bd, c2);
    const cell = ws.getCell(bd, c1);
    cell.value = text;
    cell.font = { name: FONT_NAME, size: 9 };
    cell.alignment = { vertical: 'top', wrapText: true };
    for (let c = c1; c <= c2; c++) ws.getCell(bd, c).border = BORDER_THIN;
  };
  bv(1, 2, bankCny);
  bv(3, 4, bankThb);
  bv(11, 14, bankPublic);

  if (qrBuf) {
    try {
      const imgId = wb.addImage({ buffer: qrBuf as any, extension: 'png' });
      ws.addImage(imgId, { tl: { col: 5, row: br - 0.5 }, ext: { width: 180, height: 180 } });
    } catch (e: any) { console.warn('generate-bill-xlsx:', e?.message) }
  }

  return await wb.xlsx.writeBuffer();
}
