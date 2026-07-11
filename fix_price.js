const fs = require("fs");
let s = fs.readFileSync("src/app/api/bills/export/route.ts", "utf8");

// After customer lookup, add price matrix parser
const insertAfterCustomer = `
  let priceMatrix = {};
  if (customer?.priceMatrix) { try { priceMatrix = JSON.parse(customer.priceMatrix); } catch {} }
  const getPrice = (t, c) => {
    const m = t === '海运' ? 'sea' : 'land';
    const ty = c === '普货' ? 'regular' : c === '商检货' ? 'inspection' : 'sensitive';
    return priceMatrix[m + '_' + ty] || 0;
  };`;

s = s.replace(
  "const rows: BillRow[] = [];\n  let totalCny = 0;\n",
  "const rows: BillRow[] = [];\n  let totalCny = 0;\n" + insertAfterCustomer + "\n"
);

// Build order receivable totals per运单号 (before per-item loop)
// Replace the orderTotalVol block to also compute orderReceivable
s = s.replace(
  "for (const mId of markIds) {\n    const mark = markMap.get(mId);\n    const scItems = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mId)).all();\n    const ldItems = await db.select().from(loadingItems).where(eq(loadingItems.markId, mId)).all();\n\n    const orderTotalVol = new Map<string, number>();",
  `for (const mId of markIds) {
    const mark = markMap.get(mId);
    const scItems = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mId)).all();
    const ldItems = await db.select().from(loadingItems).where(eq(loadingItems.markId, mId)).all();

    // Compute order-level receivable totals (price × volume per运单号)
    const orderReceivable = new Map<string, number>();
    for (const item of [...scItems, ...ldItems]) {
      const key = (item as any).运单号 || '_' + (item as any).id;
      const up2 = getPrice((item as any).运输方式 || '', (item as any).货型 || '');
      const sv2 = (item as any).单箱体积 || 0;
      orderReceivable.set(key, (orderReceivable.get(key) || 0) + up2 * sv2);
    }

    const orderTotalVol = new Map<string, number>();`
);

// Replace unit price: from DB cost → from customer price matrix
s = s.replace(
  /const up = \(item as any\)\.成本单价_cents \?\? 0;/g,
  "const up = getPrice((item as any).运输方式 || '', (item as any).货型 || '');"
);

// Replace order total: from DB字段 → from computed receivable per order
s = s.replace(
  /const amt = \(item as any\)\.订单总价_cents \?\? \(item as any\)\.需支付总价_cents \?\? 0;/g,
  "const amt = orderReceivable.get(okey) || 0;"
);

// Update totalCny to use receipt amount
s = s.replace(
  /totalCny \+= \(item as any\)\.需支付总价_cents \?\? 0;/g,
  "totalCny += orderReceivable.get(okey) || 0;"
);

fs.writeFileSync("src/app/api/bills/export/route.ts", s);
console.log("fixed");
