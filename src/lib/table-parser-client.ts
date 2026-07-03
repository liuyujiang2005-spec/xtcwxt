import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import FormData from 'form-data';

const PARSER_URL = process.env.TABLE_PARSER_URL || 'http://localhost:8800';

/**
 * 将上传到服务器的 Excel 文件转发给 Python 解析服务
 */
export async function parseViaPythonService(filePath: string): Promise<any> {
  try {
    const form = new FormData();
    form.append('file', createReadStream(filePath));
    form.append('classify', 'false');

    const res = await fetch(`${PARSER_URL}/api/table/parse`, {
      method: 'POST',
      body: form as any,
      headers: form.getHeaders(),
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
      allItems.push({
        rowIndex: 0,
        markNo: row.唛头号 || row.唛头 || row.markNo || row.订单号 || row.国内单号 || '',
        品名: row.品名 || row.名称 || row.货物名称 || row.Item || '',
        客户: row.客户 || row.客户名称 || row.Customer || '',
        尺寸_长: parseFloat(row.尺寸_长 || row.长 || row.Length || 0),
        尺寸_宽: parseFloat(row.尺寸_宽 || row.宽 || row.Width || 0),
        尺寸_高: parseFloat(row.尺寸_高 || row.高 || row.Height || 0),
        单箱体积: parseFloat(row.单箱体积 || row.每箱体积 || 0),
        总体积: parseFloat(row.总体积 || row.体积 || row.CBM || 0),
        成本单价: parseFloat(row.成本单价 || row.单价 || row.Unit || 0),
        国内单号: row.国内单号 || row.单号 || '',
        单箱数量: parseInt(row.单箱数量 || row.数量 || 0),
        总重量: parseFloat(row.总重量 || row.重量 || 0),
        箱数: parseInt(row.箱数 || row.件数 || 0),
        pcs数量: parseInt(row.pcs数量 || row.pcs || 0),
        货型: row.货型 || row.货物类型 || '',
        运输方式: row.运输方式 || row.运输 || '',
        需支付总价: parseFloat(row.总价 || row.需支付总价 || row.总金额 || 0),
        结算状态: row.结算状态 || row.状态 || '',
        verdict: '通过',
        reason: '',
      });
    }
  }

  const items = allItems.map((item, idx) => {
    item.rowIndex = idx + 1;
    if (item.总体积 <= 0 && item.需支付总价 <= 0) {
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
