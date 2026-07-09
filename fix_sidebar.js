const fs = require("fs");
let s = fs.readFileSync("src/components/sidebar.tsx", "utf8");

// Remove supplier menu items 
s = s.replace(/\s*\{ name: '供应商应付', href: '\/accounts\/suppliers', icon: Truck \},\n/g, "");
s = s.replace(/\s*\{ name: '供应商管理', href: '\/suppliers', icon: Truck \},\n/g, "");

// Clean arrays
s = s.replace(/'供应商应付', /g, "");
s = s.replace(/, '供应商管理'/g, "");
s = s.replace(/'供应商管理'/g, "");

// Clean double commas
s = s.replace(/, ,/g, ",");
s = s.replace(/\[ ,/g, "[");

fs.writeFileSync("src/components/sidebar.tsx", s);
console.log("done");
