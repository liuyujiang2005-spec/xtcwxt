const CNY_FORMATTER = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});

const THB_FORMATTER = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});

export function formatAmount(amount: number, currency: string = 'CNY'): string {
  if (!isFinite(amount)) return currency + " —";
  
  if (currency === 'THB') {
    return THB_FORMATTER.format(amount);
  }
  return CNY_FORMATTER.format(amount);
}

export function formatNumber(n: number, decimals: number = 2): string {
  return n.toFixed(decimals);
}

export function centsToYuan(amount: number): number {
  return amount;
}

export function getMonthTag(date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function generateShipmentNo(monthTag: string, count: number): string {
  return `SHIP-${monthTag.replace('-', '')}-${String(count).padStart(4, '0')}`;
}

export function generateInvoiceNo(type: string, count: number): string {
  const prefix = type === '应收发票' ? 'AR' : 'AP';
  return `${prefix}-${String(count).padStart(6, '0')}`;
}
