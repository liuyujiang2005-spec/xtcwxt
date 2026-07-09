const fs = require("fs");
["src/app/(main)/revenue/NewIncomeDialog.tsx", "src/app/(main)/revenue/EditIncomeDialog.tsx", "src/app/(main)/expenses/NewExpenseDialog.tsx"].forEach(fp => {
  let s = fs.readFileSync(fp, "utf8");
  s = s.replace(/onValueChange=\{setCurrency\}/g, "onValueChange={v => setCurrency(v || 'CNY')}");
  fs.writeFileSync(fp, s);
  console.log(fp, "fixed");
});
