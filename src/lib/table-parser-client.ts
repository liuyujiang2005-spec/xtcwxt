import { readFileSync } from 'fs';
import { unlink } from 'fs/promises';

const PARSER_URL = process.env.TABLE_PARSER_URL || 'http://localhost:8800';

/**
 * 将上传到服务器的 Excel 文件转发给 Python 解析服务
 */
export async function parseViaPythonService(filePath: string): Promise<any> {
  try {
    const buffer = readFileSync(filePath);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const form = new FormData();
    form.append('file', blob, 'upload.xlsx');
    form.append('classify', 'false');

    const res = await fetch(`${PARSER_URL}/api/table/parse`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Python 解析服务异常: ${res.status} ${err}`);
    }

    return await res.json();
  } finally {
    unlink(filePath).catch(() => {});
  }
}

/**
 * 将 Python 解析结果映射为 extract-sc/extract-loading 返回格式
 */
export function mapPythonResult(pyData: any): { items: any[]; summary: { totalItems: number; abnormalCount: number } } {
  const orders = pyData?.订单 || [];
  const allItems: any[] = [];

  for (const order of orders) {
    const details = order.产品明细 || [order];
    for (const detail of details) {
      const row = { ...order, ...detail };
      delete row.产品明细;

      // 唛头即客户标识
      const mark = row.唛头 || row.唛头号 || row.markNo || '';
      // 尺寸是合并字段（如 "20×30×40"），不拆分长宽高，用单项体积和计费体积代替
      const dimStr = row.尺寸 || row.规格 || '';

      allItems.push({
        rowIndex: 0,
        markNo: mark || row.运单号 || row.订单号 || '',
        品名: row.品名 || row.名称 || row.货物名称 || '',
        客户: mark,
        日期: row.日期 || '',
        仓库: row.仓库 || row.仓位 || '',
        运输方式: row.运输方式 || row.运输 || '',
        运单号: row.运单号 || row.国内单号 || row.单号 || '',
        货型: row.货型 || row.货物类型 || '',
        尺寸: dimStr,
        件数: parseInt(row.件数 || row.箱数 || 0),
        国内单号: row.国内单号 || row.单号 || '',
        单项体积: parseFloat(row.单项体积 || row.单箱体积 || 0),
        单项重量: parseFloat(row.单项重量 || row.单箱重量 || 0),
        总体积: parseFloat(row.总体积 || row.体积 || 0),
        总重量: parseFloat(row.总重量 || row.重量 || 0),
        计费体积: parseFloat(row.计费体积 || row.单项体积 || 0),
        总计费体积: parseFloat(row.总计费体积 || 0),
        单价: parseFloat(row.单价 || row.成本单价 || 0),
        单项价格: parseFloat(row.单项价格 || row.金额 || 0),
        订单总价: parseFloat(row.订单总价 || row.总价 || row.需支付总价 || 0),
        备注: row.备注 || '',
        结算状态: row.结算状态 || row.状态 || '',
        柜号: row.柜号 || '',
        // 兼容拼柜上传页旧字段名
        尺寸_长: 0,
        尺寸_宽: 0,
        尺寸_高: 0,
        成本单价: parseFloat(row.单价 || row.成本单价 || 0),
        单箱体积: parseFloat(row.单项体积 || row.单箱体积 || 0),
        单箱数量: parseInt(row.件数 || row.单箱数量 || 0),
        箱数: parseInt(row.件数 || row.箱数 || 0),
        pcs数量: 0,
        需支付总价: parseFloat(row.单项价格 || row.订单总价 || row.总价 || row.需支付总价 || 0),
        cost_status: '待支出',
        payment_status: '待支付',
        verdict: '通过',
        reason: '',
      });
    }
  }

  const items = allItems.map((item, idx) => {
    item.rowIndex = idx + 1;
    if (item.计费体积 <= 0 && item.单项价格 <= 0 && item.订单总价 <= 0) {
      item.verdict = '异常';
      item.reason = '未识别到体积和金额';
    }
    return item;
  });

  return {
    items,
    summary: { totalItems: items.length, abnormalCount: items.filter(i => i.verdict === '异常').length },
  };
}
