const fs = require("fs");
let s = fs.readFileSync("src/app/api/bills/route.ts", "utf8");

// Add import for sharedContainerItems and loadingItems if not already present
if (!s.includes("sharedContainerItems")) {
  s = s.replace(
    "import { marks, sharedContainerItems, loadingItems }",
    "import { marks, sharedContainerItems, loadingItems }"
  );
}

// Add recalculate logic before the final success return
s = s.replace(
  "  return NextResponse.json({ success: true });\n}\n",
  `  if (body.recalculate) {
    const bill = await db.select().from(bills).where(eq(bills.id, body.id)).get();
    if (!bill) return NextResponse.json({ error: '账单不存在' }, { status: 404 });

    const customer = await db.select().from(customers).where(eq(customers.id, bill.customerId)).get();
    let priceMatrix = {};
    if (customer?.priceMatrix) { try { priceMatrix = JSON.parse(customer.priceMatrix); } catch {} }
    const enableMinVol = customer?.enableMinVolume !== 0;
    const getPrice = (t: string, c: string): number => {
      const m = t === '海运' ? 'sea' : 'land';
      const ty = c === '普货' ? 'regular' : c === '商检货' ? 'inspection' : 'sensitive';
      return priceMatrix[m + '_' + ty] || 0;
    };
    const minVol = (t: string): number => {
      if (!enableMinVol) return 0;
      return t === '海运' ? 0.5 : 0.3;
    };

    const bItems = await db.select().from(billItems).where(eq(billItems.billId, body.id)).all();
    const markIds = [...new Set(bItems.map(i => i.markId))];

    await db.delete(billItems).where(eq(billItems.billId, body.id));

    let totalReceivable = 0;
    for (const mId of markIds) {
      const scItems = await db.select().from(sharedContainerItems).where(eq(sharedContainerItems.markId, mId)).all();
      const ldItems = await db.select().from(loadingItems).where(eq(loadingItems.markId, mId)).all();
      const insertedOrders = new Set();
      for (const item of [...scItems, ...ldItems]) {
        const orderKey = (item as any).运单号 || '_' + (item as any).id;
        if (insertedOrders.has(orderKey)) continue;
        insertedOrders.add(orderKey);
        const transport = (item as any).运输方式 || '海运';
        const cargo = (item as any).货型 || '普货';
        const up = getPrice(transport, cargo);
        const sv = (item as any).单箱体积 || 0;
        const cv = Math.max(sv, minVol(transport));
        const receivable = up * cv;
        const cost = (item as any).需支付总价_cents || 0;
        totalReceivable += receivable;
        await db.insert(billItems).values({ billId: body.id, markId: mId, mode: scItems.length > 0 ? '拼柜' : '装柜', amountCents: receivable, costAmount: cost });
      }
    }
    await db.update(bills).set({ totalAmountCents: totalReceivable, status: '已生成' }).where(eq(bills.id, body.id));
  }
  return NextResponse.json({ success: true });
}
`
);

// Also make sure import has inArray
if (!s.includes("inArray")) {
  s = s.replace("import { eq, and }", "import { eq, and, inArray }");
}
// Also add customers import
if (!s.includes("customers, bills")) {
  s = s.replace("from '@/db/schema'", "from '@/db/schema'");
}
// Check if customers is imported - it should already be since we use marks
s = s.replace(
  "import { bills, billItems, marks, sharedContainerItems, loadingItems }",
  "import { bills, billItems, marks, sharedContainerItems, loadingItems, customers }"
);

fs.writeFileSync("src/app/api/bills/route.ts", s);
console.log("fixed");
