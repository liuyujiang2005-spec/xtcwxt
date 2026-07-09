const fs = require("fs");

// 1. Sidebar
let s = fs.readFileSync("src/components/sidebar.tsx", "utf8");
s = s.replace(/\n      \{ name: '供应商应付', href: '\/accounts\/suppliers', icon: Truck \},\n/g, "\n");
fs.writeFileSync("src/components/sidebar.tsx", s);
console.log("1. sidebar fixed");

// 2. Delete direct-income directory
fs.rmSync("src/app/(main)/direct-income", { recursive: true, force: true });
console.log("2. direct-income deleted");

// 3. Expenses page - change button
s = fs.readFileSync("src/app/(main)/expenses/page.tsx", "utf8");
s = s.replace(
  '<Link href="/direct-income/new"><Button><Plus className="h-4 w-4 mr-2" />新建费用</Button></Link>',
  '<NewExpenseDialog />'
);
// Fix import
if (!s.includes("import { NewExpenseDialog }")) {
  s = s.replace(
    "import { DeleteExpenseButton } from './DeleteExpenseButton';",
    "import { DeleteExpenseButton } from './DeleteExpenseButton';\nimport { NewExpenseDialog } from './NewExpenseDialog';"
  );
}
fs.writeFileSync("src/app/(main)/expenses/page.tsx", s);
console.log("3. expenses fixed");
