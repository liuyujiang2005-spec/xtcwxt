const fs = require("fs");

// Fix bills page - add ReceiptUploader
let s = fs.readFileSync("src/app/(main)/bills/page.tsx", "utf8");
if (!s.includes("ReceiptUploader")) {
  s = s.replace("import { Download }", "import { ReceiptUploader } from './ReceiptUploader';\nimport { Download }");
  // Add uploader after export button
  s = s.replace(
    /(<a href=\{`\/api\/bills\/export\?billId=\$\{b\.id\}`\}.*?<\/a>)/,
    "$1\n                  <ReceiptUploader apiPath=\"/api/bills\" entityId={b.id} currentUrl={(b as any).receiptUrl} updateField=\"receiptUrl\" />"
  );
}
fs.writeFileSync("src/app/(main)/bills/page.tsx", s);
console.log("bills page updated");

// Fix expenses page - add ReceiptUploader to each expense row
s = fs.readFileSync("src/app/(main)/expenses/page.tsx", "utf8");
if (!s.includes("ReceiptUploader")) {
  s = s.replace("import { DeleteExpenseButton }", "import { ReceiptUploader } from '../bills/ReceiptUploader';\nimport { DeleteExpenseButton }");
  // Add after delete button
  s = s.replace(
    /(<DeleteExpenseButton expenseId=\{e\.id\} \/>)/,
    "$1\n                        <ReceiptUploader apiPath={`/api/expenses/${e.id}`} entityId={e.id} currentUrl={(e as any).receiptUrl} updateField=\"receiptUrl\" />"
  );
}
fs.writeFileSync("src/app/(main)/expenses/page.tsx", s);
console.log("expenses page updated");
