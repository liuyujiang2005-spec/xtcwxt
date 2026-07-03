import ExcelJS from 'exceljs';

export interface BillRow {
  日期: string;
  唛头: string;
  入库仓位: string;
  运输方式: string;
  单号: string;
  货物类型: string;
  品名: string;
  尺寸: string;
  件数: number;
  单项体积: number;
  计费体积: number;
  单价: number;
  备注: string;
  结算状态: string;
  柜号: string;
}

export async function generateBillXlsx(
  companyName: string,
  customerName: string,
  month: string,
  rows: BillRow[],
  totalCny: number,
  totalThb: number,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '货运财务系统';
  const ws = wb.addWorksheet(month);

  // ── 列宽 ──
  ws.columns = [
    { width: 12 }, { width: 14 }, { width: 10 }, { width: 8 },
    { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 },
    { width: 6 }, { width: 12 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 14 }, { width: 14 }, { width: 10 },
    { width: 10 }, { width: 14 },
  ];

  // ── 样式 ──
  const titleFont = { name: '微软雅黑', size: 16, bold: true };
  const headerFont = { name: '微软雅黑', size: 10, bold: true };
  const dataFont = { name: '微软雅黑', size: 9 };
  const border = {
    top: { style: 'thin' as const },
    left: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };
  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9E1F2' } };

  // Row 1: 公司名
  ws.mergeCells('A1:J1');
  const r1 = ws.getCell('A1');
  r1.value = companyName;
  r1.font = titleFont;
  r1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  // Row 2: 请款单
  ws.mergeCells('A2:J2');
  const r2 = ws.getCell('A2');
  r2.value = '请款单';
  r2.font = { name: '微软雅黑', size: 14, bold: true };
  r2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 28;

  // Row 3: 客户 + 月份
  ws.mergeCells('A3:S3');
  ws.getCell('A3').value = `客户：${customerName}    月份：${month}`;
  ws.getCell('A3').font = { name: '微软雅黑', size: 10 };
  ws.getRow(3).height = 22;

  // Row 4: 提示
  ws.mergeCells('A4:S4');
  ws.getCell('A4').value = '如有疑问请在两个工作日之内提出，以便我们及时核实，修改账单。确认金额后请及时安排付款，感谢配合！';
  ws.getCell('A4').font = { name: '微软雅黑', size: 9, italic: true };
  ws.getRow(4).height = 20;

  // Row 5: 表头
  const headers = [
    '日期', '唛头', '仓位', '运输', '单号', '货物类型', '品名', '尺寸',
    '件数', '入库单号', '单项体积', '单项重量', '总体积', '总重量',
    '计费体积', '总计费体积', '单价', '单项价格', '订单总价', '备注',
    '结算状态', '柜号',
  ];

  const headerRow = ws.getRow(5);
  headerRow.height = 28;
  headers.forEach((h, i) => {
    const col = i + 1;
    const cell = ws.getCell(5, col);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.border = border;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  // ── 数据行 ──
  let currentRow = 5;
  for (const row of rows) {
    currentRow++;
    const r = ws.getRow(currentRow);
    r.height = 20;

    const vals = [
      row.日期, row.唛头, row.入库仓位, row.运输方式, row.单号,
      row.货物类型, row.品名, row.尺寸, row.件数, '',
      row.单项体积, '', '', '',
      row.计费体积, '', row.单价,
      null, null, row.备注, row.结算状态, row.柜号,
    ];

    vals.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.font = dataFont;
      cell.border = border;
      cell.alignment = { horizontal: i >= 10 ? 'right' : 'left', vertical: 'middle' };
    });

    // R列 (18): 单项价格 = 单价 × 计费体积
    r.getCell(18).value = { formula: `Q${currentRow}*O${currentRow}`, result: row.计费体积 * row.单价 };
    r.getCell(18).numFmt = '#,##0.00';
    r.getCell(18).font = dataFont;
    r.getCell(18).border = border;
    r.getCell(18).alignment = { horizontal: 'right', vertical: 'middle' };

    // S列 (19): 订单总价 = 单项价格
    r.getCell(19).value = { formula: `R${currentRow}`, result: row.计费体积 * row.单价 };
    r.getCell(19).numFmt = '#,##0.00';
    r.getCell(19).font = dataFont;
    r.getCell(19).border = border;
    r.getCell(19).alignment = { horizontal: 'right', vertical: 'middle' };
  }

  // ── 合计行 ──
  const totalRow = currentRow + 1;
  ws.getRow(totalRow).height = 22;
  ws.mergeCells(`A${totalRow}:Q${totalRow}`);
  ws.getCell(totalRow, 1).value = 'CNY 合计';
  ws.getCell(totalRow, 1).font = { name: '微软雅黑', size: 11, bold: true };
  ws.getCell(totalRow, 1).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(totalRow, 18).value = { formula: `SUM(R6:R${currentRow})`, result: totalCny };
  ws.getCell(totalRow, 18).numFmt = '#,##0.00';
  ws.getCell(totalRow, 18).font = { name: '微软雅黑', size: 11, bold: true };
  ws.getCell(totalRow, 19).value = { formula: `SUM(S6:S${currentRow})`, result: totalCny };
  ws.getCell(totalRow, 19).numFmt = '#,##0.00';
  ws.getCell(totalRow, 19).font = { name: '微软雅黑', size: 11, bold: true };

  for (let c = 1; c <= 22; c++) {
    ws.getCell(totalRow, c).border = border;
  }

  // 泰铢合计
  if (totalThb > 0) {
    const thbRow = totalRow + 1;
    ws.getRow(thbRow).height = 22;
    ws.mergeCells(`A${thbRow}:Q${thbRow}`);
    ws.getCell(thbRow, 1).value = 'THB 合计';
    ws.getCell(thbRow, 1).font = { name: '微软雅黑', size: 11, bold: true };
    ws.getCell(thbRow, 1).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell(thbRow, 18).value = totalThb;
    ws.getCell(thbRow, 18).numFmt = '#,##0.00';
    ws.getCell(thbRow, 18).font = { name: '微软雅黑', size: 11, bold: true };
    ws.getCell(thbRow, 19).value = totalThb;
    ws.getCell(thbRow, 19).numFmt = '#,##0.00';
    ws.getCell(thbRow, 19).font = { name: '微软雅黑', size: 11, bold: true };

    for (let c = 1; c <= 22; c++) {
      ws.getCell(thbRow, c).border = border;
    }
  }

  // ── 收款账户信息 ──
  const bankStart = (totalThb > 0 ? totalRow + 2 : totalRow + 1) + 1;
  const bankInfo = [
    ['人民币收款账户', '泰铢收款账户', '公户收款账号'],
    ['621226 3602123327850 刘雄\n工商银行广州江南市场支行', 'scb\n4301138403 Xiong liu\nSWIFT: SICOTHBK', '暹联出海企业管理咨询(深圳)有限公司\n41015400040090685\n中国农业银行深圳蛇口支行'],
  ];

  bankInfo.forEach((bankRow, bi) => {
    const r = ws.getRow(bankStart + bi);
    r.height = bi === 0 ? 28 : 50;
    bankRow.forEach((v, ci) => {
      const col = ci === 0 ? 1 : ci === 1 ? 8 : 15;
      const colEnd = col + 5;
      ws.mergeCells(bankStart + bi, col, bankStart + bi, colEnd);
      const cell = ws.getCell(bankStart + bi, col);
      cell.value = v;
      if (bi === 0) {
        cell.font = { name: '微软雅黑', size: 10, bold: true };
      } else {
        cell.font = { name: '微软雅黑', size: 9 };
        cell.alignment = { wrapText: true, vertical: 'top' };
      }
    });
  });

  return await wb.xlsx.writeBuffer();
}
