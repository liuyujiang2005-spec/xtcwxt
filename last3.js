const fs = require("fs");

// 1. bill-download-card.tsx: validate API response is array before .map
let fp = "src/app/(main)/bills/bill-download-card.tsx";
let s = fs.readFileSync(fp, "utf8");
s = s.replace(
  ".then(r => r.json()).then(setCustomers).catch(() => {});",
  ".then(r => r.json()).then(d => setCustomers(Array.isArray(d) ? d : [])).catch(() => {});"
);
fs.writeFileSync(fp, s);
console.log("1. bill-download-card fixed");

// 2. NewBatchButton: use local date instead of UTC
fp = "src/app/(main)/loading-lists/NewBatchButton.tsx";
s = fs.readFileSync(fp, "utf8");
s = s.replace(
  "new Date().toISOString().substring(0, 10).replace(/-/g, '')",
  "`${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}`"
);
fs.writeFileSync(fp, s);
console.log("2. NewBatchButton fixed");

// 3. costs/[id]: add AbortController
fp = "src/app/(main)/costs/[id]/page.tsx";
s = fs.readFileSync(fp, "utf8");
s = s.replace(
  "    fetch(`/api/expenses/${id}`)",
  "    const ctrl = new AbortController();\n    fetch(`/api/expenses/${id}`, { signal: ctrl.signal })"
);
s = s.replace(
  "      .finally(() => setFetching(false));",
  "      .finally(() => setFetching(false));\n    return () => ctrl.abort();"
);
fs.writeFileSync(fp, s);
console.log("3. costs/[id] fixed");
