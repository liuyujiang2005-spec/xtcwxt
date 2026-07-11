const fs = require("fs");
let s = fs.readFileSync("src/app/api/bills/export/route.ts", "utf8");

// Add minVol function after getPrice
s = s.replace(
  "  };\n\n  for (const mId of markIds)",
  "  };\n  const enableMinVol = customer?.enableMinVolume !== 0;\n  const minVol = (t: string): number => {\n    if (!enableMinVol) return 0;\n    return t === '海运' ? 0.5 : 0.3;\n  };\n\n  for (const mId of markIds)"
);

// In order receivable, use chargeable volume
s = s.replace(
  "const sv2 = (item as any).单箱体积 || 0;\n      orderReceivable.set(key, (orderReceivable.get(key) || 0) + up2 * sv2);",
  "const sv2 = (item as any).单箱体积 || 0;\n      const transp2 = (item as any).运输方式 || '海运';\n      const cv2 = Math.max(sv2, minVol(transp2));\n      orderReceivable.set(key, (orderReceivable.get(key) || 0) + up2 * cv2);"
);

// In per-item loop, add计费体积 with低消 and replace sv writing
s = s.replace(
  "const sv = (item as any).单箱体积 ?? 0;\n      const ct",
  "const sv = (item as any).单箱体积 ?? 0;\n      const cv = Math.max(sv, minVol((item as any).运输方式 || '海运'));\n      const ct"
);

// Replace writen items for计费体积
s = s.replace(
  "计费体积: sv,",
  "计费体积: cv,"
);

// Also fix totalCny to not add order amount per item (it gets counted multiple times for same order)
// We add totalCny once, but per-item loop adds for each item. Fix: only add for first item of each order
s = s.replace(
  "totalCny += amt;\n\n      const dims",
  "const dims"
);

// Add totalCny accumulation AFTER the per-item loop
s = s.replace(
  "rows.push({\n        日期: mark?.createdAt?.substring(0, 10) ?? bill.monthTag,\n        唛头: mark?.markNo ?? '',\n        仓库: (item as any).仓库 || '',\n        运输方式: (item as any).运输方式 ?? '',\n        运单号: (item as any).运单号 ?? mark?.markNo ?? '',\n        货型: (item as any).货型 ?? '',\n        品名: (item as any).品名 ?? '',\n         尺寸: dims,\n         件数: ct,\n        国内单号: (item as any).国内单号 ?? '',\n        单项体积: sv,\n        单项重量: (item as any).单项重量 ?? 0,\n        总体积: vol,\n        总重量: (item as any).总重量 ?? 0,\n        计费体积: cv,\n        总计费体积: tv,\n        单价: up,\n        订单总价: amt,\n        备注: (item as any).备注 || '',\n        结算状态: (item as any).cost_status ?? (item as any).payment_status ?? '',\n      });\n    }\n  }",
  "rows.push({\n        日期: mark?.createdAt?.substring(0, 10) ?? bill.monthTag,\n        唛头: mark?.markNo ?? '',\n        仓库: (item as any).仓库 || '',\n        运输方式: (item as any).运输方式 ?? '',\n        运单号: (item as any).运单号 ?? mark?.markNo ?? '',\n        货型: (item as any).货型 ?? '',\n        品名: (item as any).品名 ?? '',\n         尺寸: dims,\n         件数: ct,\n        国内单号: (item as any).国内单号 ?? '',\n        单项体积: sv,\n        单项重量: (item as any).单项重量 ?? 0,\n        总体积: vol,\n        总重量: (item as any).总重量 ?? 0,\n        计费体积: cv,\n        总计费体积: tv,\n        单价: up,\n        订单总价: amt,\n        备注: (item as any).备注 || '',\n        结算状态: (item as any).cost_status ?? (item as any).payment_status ?? '',\n      });\n    }\n    for (const amt of orderReceivable.values()) { totalCny += amt; }\n  }"
);

fs.writeFileSync("src/app/api/bills/export/route.ts", s);
console.log("fixed");
