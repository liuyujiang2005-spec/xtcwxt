const fs = require("fs");

// Fix 5: LoadingExpenseManager - add res.ok check  
let s = fs.readFileSync("src/app/(main)/loading-lists/[id]/LoadingExpenseManager.tsx", "utf8");
s = s.replace(
  "      if (existing) {\n" +
  "        await fetch(`/api/expenses/${existing.id}`, {\n" +
  "          method: 'PATCH',\n" +
  "          headers: { 'Content-Type': 'application/json' },\n" +
  "          body: JSON.stringify({ amountCents, currency: entry.currency }),\n" +
  "        });\n" +
  "      } else if (amountCents > 0) {\n" +
  "        await fetch('/api/expenses', {\n" +
  "          method: 'POST',\n" +
  "          headers: { 'Content-Type': 'application/json' },\n" +
  "          body: JSON.stringify({ loadingBatchId: batchId, expenseType, amountCents, currency: entry.currency }),\n" +
  "        });\n" +
  "      }",
  "      if (existing) {\n" +
  "        const r = await fetch(`/api/expenses/${existing.id}`, { method: 'PATCH',\n" +
  "          headers: { 'Content-Type': 'application/json' },\n" +
  "          body: JSON.stringify({ amountCents, currency: entry.currency }) });\n" +
  "        if (!r.ok) { const e = await r.json().catch(()=>({error:'保存失败'})); throw new Error(e.error); }\n" +
  "      } else if (amountCents > 0) {\n" +
  "        const r = await fetch('/api/expenses', { method: 'POST',\n" +
  "          headers: { 'Content-Type': 'application/json' },\n" +
  "          body: JSON.stringify({ loadingBatchId: batchId, expenseType, amountCents, currency: entry.currency }) });\n" +
  "        if (!r.ok) { const e = await r.json().catch(()=>({error:'保存失败'})); throw new Error(e.error); }\n" +
  "      }"
);
fs.writeFileSync("src/app/(main)/loading-lists/[id]/LoadingExpenseManager.tsx", s);
console.log("LoadingExpenseManager fixed");
