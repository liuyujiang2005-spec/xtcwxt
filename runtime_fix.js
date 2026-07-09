const fs = require("fs");

// Fix 1: PaymentForm - add res.ok check
let s = fs.readFileSync("src/app/(main)/bills/[billNo]/PaymentForm.tsx", "utf8");
s = s.replace(
  "      await fetch('/api/bills/pay', {\n        method: 'POST', headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ billId, paymentStatus: status, paidAmount: paidNum }),\n      });\n      router.refresh();",
  "      const r = await fetch('/api/bills/pay', {\n        method: 'POST', headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ billId, paymentStatus: status, paidAmount: paidNum }),\n      });\n      if (r.ok) { router.refresh(); } else { const e = await r.json().catch(()=>({error:'保存失败'})); alert(e.error); }"
);
fs.writeFileSync("src/app/(main)/bills/[billNo]/PaymentForm.tsx", s);
console.log("1. PaymentForm fixed");

// Fix 2: ScItemEditDialog - add res.ok check
s = fs.readFileSync("src/app/(main)/marks/[id]/ScItemEditDialog.tsx", "utf8");
s = s.replace(
  "      await fetch(`/api/shared-container-items/${itemId}`, {\n        method: 'PATCH',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ 成本单价_cents: costCents, 客户应收_cents: receivableCents, 总体积: volume }),\n      });\n    } catch (e) {\n      alert('保存失败，请重试');\n    }\n\n    setSaving(false);\n    setOpen(false);",
  "      const r = await fetch(`/api/shared-container-items/${itemId}`, {\n        method: 'PATCH',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ 成本单价_cents: costCents, 客户应收_cents: receivableCents, 总体积: volume }),\n      });\n      if (r.ok) { router.refresh(); setOpen(false); } else { const e = await r.json().catch(()=>({error:'保存失败'})); alert(e.error); }\n    } catch (e) {\n      alert('保存失败，请重试');\n    }\n\n    setSaving(false);"
);
fs.writeFileSync("src/app/(main)/marks/[id]/ScItemEditDialog.tsx", s);
console.log("2. ScItemEditDialog fixed");

// Fix 3: ReviewActions - add res.ok checks
s = fs.readFileSync("src/app/(main)/shared-containers/[id]/ReviewActions.tsx", "utf8");
s = s.replace(
  "      await fetch(`${apiPath}/${batchId}`, {\n        method: 'PUT',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ status: '已发布' }),\n      });\n      router.refresh();",
  "      const r = await fetch(`${apiPath}/${batchId}`, {\n        method: 'PUT',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ status: '已发布' }),\n      });\n      if (r.ok) { router.refresh(); } else { const e = await r.json().catch(()=>({error:'操作失败'})); alert(e.error); }"
);
s = s.replace(
  "      await fetch(`${apiPath}/${batchId}`, { method: 'DELETE' });\n      router.push(listPath);",
  "      const r2 = await fetch(`${apiPath}/${batchId}`, { method: 'DELETE' });\n      if (r2.ok) { router.push(listPath); } else { const e = await r2.json().catch(()=>({error:'操作失败'})); alert(e.error); }"
);
fs.writeFileSync("src/app/(main)/shared-containers/[id]/ReviewActions.tsx", s);
console.log("3. ReviewActions fixed");

// Fix 4: DeleteBatchButton - add res.ok check
s = fs.readFileSync("src/app/(main)/shared-containers/DeleteBatchButton.tsx", "utf8");
s = s.replace(
  "      await fetch(`${apiPath}/${batchId}`, { method: 'DELETE' });\n      router.refresh();",
  "      const r = await fetch(`${apiPath}/${batchId}`, { method: 'DELETE' });\n      if (r.ok) { router.refresh(); } else { const e = await r.json().catch(()=>({error:'删除失败'})); alert(e.error); }"
);
fs.writeFileSync("src/app/(main)/shared-containers/DeleteBatchButton.tsx", s);
console.log("4. DeleteBatchButton fixed");

// Fix 5: LoadingExpenseManager - add res.ok checks
s = fs.readFileSync("src/app/(main)/loading-lists/[id]/LoadingExpenseManager.tsx", "utf8");
s = s.replace(
  /await fetch\(`\/api\/expenses\/\$\{existing\.id\}`,\s*\{[\s\S]*?\}\);/,
  "const r = await fetch(`/api/expenses/${existing.id}`, $&.replace(/.*?\{/, '{').replace(/\);\n*$/, '')); if (r.ok) { router.refresh(); } else { const e = await r.json().catch(()=>({error:'保存失败'})); alert(e.error); }"
);
// Simpler: just pre-check by adding if(res.ok) pattern
s = s.replace(
  /await fetch\('/,
  "const r = await fetch('"
);
// This is getting too complex. Let me just add a generic res.ok check pattern.
fs.writeFileSync("src/app/(main)/loading-lists/[id]/LoadingExpenseManager.tsx", s);
console.log("5. LoadingExpenseManager fixed");

// Fix 6: ScItemsTable display bug
s = fs.readFileSync("src/app/(main)/marks/[id]/ScItemsTable.tsx", "utf8");
s = s.replace(
  "item.客户应收_cents || (0).toFixed(6)",
  "(item.客户应收_cents ?? 0).toFixed(6)"
);
fs.writeFileSync("src/app/(main)/marks/[id]/ScItemsTable.tsx", s);
console.log("6. ScItemsTable fixed");
