const fs = require("fs");

// Fix customers PUT - only set defined fields
let s = fs.readFileSync("src/app/api/customers/route.ts", "utf8");
s = s.replace(
  "    await db.update(customers)\n      .set({\n        name: body.name,\n        contact: body.contact,\n        priceMatrix: body.priceMatrix,\n        defaultCurrency: body.defaultCurrency,\n        enableMinVolume: body.enableMinVolume ?? 1,\n        remark: body.remark,\n      })",
  "    const up = {};\n" +
  "    if (body.name !== undefined) up.name = body.name;\n" +
  "    if (body.contact !== undefined) up.contact = body.contact;\n" +
  "    if (body.priceMatrix !== undefined) up.priceMatrix = body.priceMatrix;\n" +
  "    if (body.defaultCurrency !== undefined) up.defaultCurrency = body.defaultCurrency;\n" +
  "    up.enableMinVolume = body.enableMinVolume ?? 1;\n" +
  "    if (body.remark !== undefined) up.remark = body.remark;\n" +
  "    await db.update(customers).set(up)"
);
fs.writeFileSync("src/app/api/customers/route.ts", s);
console.log("customers PUT fixed");

// Fix expenses PUT - only set defined fields
s = fs.readFileSync("src/app/api/expenses/[id]/route.ts", "utf8");
s = s.replace(
  "  await db.update(expenses).set({\n    expenseType: body.expenseType,\n    amountCents: body.amountCents,\n    currency: body.currency,    status: body.status,\n    paidDate: body.paidDate || null,\n    remark: body.remark || null,\n  })",
  "  const up = {};\n" +
  "  if (body.expenseType !== undefined) up.expenseType = body.expenseType;\n" +
  "  if (body.amountCents !== undefined) up.amountCents = body.amountCents;\n" +
  "  if (body.currency !== undefined) up.currency = body.currency;\n" +
  "  if (body.status !== undefined) up.status = body.status;\n" +
  "  up.paidDate = body.paidDate || null;\n" +
  "  up.remark = body.remark || null;\n" +
  "  await db.update(expenses).set(up)"
);
fs.writeFileSync("src/app/api/expenses/[id]/route.ts", s);
console.log("expenses PUT fixed");

// Fix double THB
s = fs.readFileSync("src/app/(main)/page.tsx", "utf8");
s = s.replace(/THB THB /g, "THB ");
fs.writeFileSync("src/app/(main)/page.tsx", s);
console.log("THB fixed");
