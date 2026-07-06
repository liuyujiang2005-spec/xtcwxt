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
    unlink(filePath).catch((e) => console.error('Failed to clean temp file:', (e as any)?.message));
  }
}

/**
 * 将 Python 解析结果映射为 extract-sc/extract-loading 返回格式
 */
function round6(n: number): number {
  return Math.round(n * 1000000) / 1000000;
}

function parseSize(s: string): { l: number; w: number; h: number } | null {
  const cleaned = s.replace(/[×xX*]/g, '×').trim();
  const parts = cleaned.split('×');
  if (parts.length >= 3) {
    const l = parseFloat(parts[0]), w = parseFloat(parts[1]), h = parseFloat(parts[2]);
    if (!isNaN(l) && !isNaN(w) && !isNaN(h) && l > 0 && w > 0 && h > 0) return { l, w, h };
  }
  // Try "553326" format
  const digits = s.replace(/\D/g, '');
  if (digits.length === 6) {
    return { l: +digits.slice(0, 2), w: +digits.slice(2, 4), h: +digits.slice(4, 6) };
  }
  return null;
}

export function mapPythonResult(pyData: any): { items: any[]; summary: { totalItems: number; abnormalCount: number } } {
  const orders = pyData?.订单 || [];
  const allItems: any[] = [];

  for (const order of orders) {
    const details = order.产品明细 || [order];
    for (const detail of details) {
      const row = { ...order, ...detail };
      delete row.产品明细;
      const mark = row.唛头 || row.唛头号 || row.markNo || '';
      const dimStr = row.尺寸 || row.规格 || '';

      allItems.push({
        rowIndex: 0,
        markNo: mark || row.运单号 || row.订单号 || '',
        唛头: mark,
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
        单项体积: round6(parseFloat(row.单项体积 || row.单箱体积 || 0)),
        单项重量: round6(parseFloat(row.单项重量 || row.单箱重量 || 0)),
        总体积: round6(parseFloat(row.总体积 || row.体积 || 0)),
        总重量: round6(parseFloat(row.总重量 || row.重量 || 0)),
        计费体积: round6(parseFloat(row.计费体积 || row.单项体积 || 0)),
        总计费体积: round6(parseFloat(row.总计费体积 || 0)),
        单价: round6(parseFloat(row.单价 || row.成本单价 || 0)),
        单项价格: round6(parseFloat(row.单项价格 || row.金额 || 0)),
        订单总价: round6(parseFloat(row.订单总价 || row.总价 || row.需支付总价 || 0)),
        备注: row.备注 || '',
        结算状态: row.结算状态 || row.状态 || '',
        柜号: row.柜号 || '',
        尺寸_长: 0, 尺寸_宽: 0, 尺寸_高: 0,
        成本单价: round6(parseFloat(row.单价 || row.成本单价 || 0)),
        单箱体积: round6(parseFloat(row.单项体积 || row.单箱体积 || 0)),
        单箱数量: parseInt(row.件数 || row.单箱数量 || 0),
        箱数: parseInt(row.件数 || row.箱数 || 0),
        pcs数量: 0,
        需支付总价: round6(parseFloat(row.单项价格 || row.订单总价 || row.总价 || row.需支付总价 || 0)),
        cost_status: '待支出',
        payment_status: '待支付',
        verdict: '通过',
        reason: '',
      });
    }
  }

  // 逐条校验
  const items = allItems.map((item, idx) => {
    item.rowIndex = idx + 1;
    const reasons: string[] = [];

    // 1. 尺寸校验
    const size = parseSize(item.尺寸);
    if (item.尺寸 && !size) {
      reasons.push('尺寸格式无效');
    }

    // 2. 单项体积 = (长×宽×高÷1e6) × 件数
    if (size && item.单项体积 > 0) {
      const unitVol = round6((size.l * size.w * size.h) / 1000000);
      const expected = round6(unitVol * (item.件数 || 1));
      if (Math.abs(item.单项体积 - expected) > 0.001) {
        reasons.push(`单项体积不符：${unitVol}×${item.件数}=${expected}，表格值=${item.单项体积}`);
      }
    }

    // 3. 计费体积 ≈ 单项体积
    if (item.单项体积 > 0 && item.计费体积 > 0) {
      if (Math.abs(item.计费体积 - item.单项体积) > 0.001) {
        reasons.push(`计费体积不符：单项体积=${item.单项体积}，计费体积=${item.计费体积}`);
      }
    }

    // 4. 单项价格 ≈ 单价 × 计费体积
    if (item.单价 > 0 && item.单项价格 > 0) {
      const chargeVol = item.计费体积 > 0 ? item.计费体积 : item.单项体积;
      const expected = round6(item.单价 * chargeVol);
      if (Math.abs(item.单项价格 - expected) > Math.max(0.1, expected * 0.01)) {
        reasons.push(`单项价格不符：${item.单价}×${chargeVol}=${expected}，表格值=${item.单项价格}`);
      }
    }

    // 5. 单项重量
    if (item.总重量 === 0 && item.单项重量 <= 0 && item.总体积 > 0) {
      // 重量为 0 不一定异常，但若全为空则提示
    }

    if (reasons.length > 0) {
      item.verdict = '异常';
      item.reason = reasons.join('；');
    }
    return item;
  });

  // 6. 订单内汇总校验：按运单号分组
  const groups = new Map<string, any[]>();
  for (const item of items) {
    const key = (item.运单号 || `_${item.rowIndex}`) + '|' + (item.唛头 || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  for (const [key, group] of groups) {
    if (group.length <= 1) continue;
    const first = group[0];

    // 汇总总体积 vs 头层总体积 (单项体积已是总立方，不乘件数)
    if (first.总体积 > 0) {
      const sumVol = round6(group.reduce((s: number, i: any) => s + i.单项体积, 0));
      if (Math.abs(sumVol - first.总体积) > 0.001) {
        for (const item of group) {
          if (item.verdict === '通过') { item.verdict = '异常'; item.reason = ''; }
          item.reason = item.reason ? item.reason + '；汇总总体积不符(' + sumVol + '≠' + first.总体积 + ')' : '汇总总体积不符(' + sumVol + '≠' + first.总体积 + ')';
        }
      }
    }

    // 汇总总重量 vs 头层总重量 (单项重量是行总重量，不乘件数)
    if (first.总重量 > 0) {
      const sumW = round6(group.reduce((s: number, i: any) => s + i.单项重量, 0));
      if (Math.abs(sumW - first.总重量) > 0.001) {
        for (const item of group) {
          if (item.verdict === '通过') { item.verdict = '异常'; item.reason = ''; }
          item.reason = item.reason ? item.reason + '；汇总总重量不符' : '汇总总重量不符';
        }
      }
    }

    // 汇总单项价格 vs 订单总价
    if (first.订单总价 > 0) {
      const sumP = round6(group.reduce((s: number, i: any) => s + i.单项价格, 0));
      if (Math.abs(sumP - first.订单总价) > 0.01) {
        for (const item of group) {
          if (item.verdict === '通过') { item.verdict = '异常'; item.reason = ''; }
          item.reason = item.reason ? item.reason + '；汇总总价不符(' + sumP.toFixed(2) + '≠' + first.订单总价.toFixed(2) + ')' : '汇总总价不符(' + sumP.toFixed(2) + '≠' + first.订单总价.toFixed(2) + ')';
        }
      }
    }
  }

  return {
    items,
    summary: { totalItems: items.length, abnormalCount: items.filter(i => i.verdict === '异常').length },
  };
}

