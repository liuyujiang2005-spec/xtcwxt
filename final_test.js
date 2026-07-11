const http = require("http");
const X = require("exceljs");
const D = require("./node_modules/better-sqlite3");
const db = new D("./data.db");
let SID = "";

function login(cb) {
  const d = JSON.stringify({ username: "admin", password: "Aa112233" });
  const r = http.request({ hostname: "localhost", port: 3000, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, res => {
    let b = ""; res.on("data", c => b += c); res.on("end", () => {
      const sc = (res.headers["set-cookie"] || []).find(c => c.startsWith("session="));
      SID = sc ? sc.split(";")[0].split("=")[1] : "";
      cb(res.statusCode);
    });
  });
  r.write(d); r.end();
}

function get(path, cb) {
  http.request({ hostname: "localhost", port: 3000, path, method: "GET", headers: { "Cookie": "session=" + SID } }, res => {
    let chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => cb(res.statusCode, Buffer.concat(chunks)));
  }).end();
}

login(() => {
  console.log("=== 1. 数据库状态 ===");
  const sc = db.prepare("SELECT COUNT(*) as c FROM shared_container_items").get().c;
  const marks = db.prepare("SELECT COUNT(*) as c FROM marks").get().c;
  const bills = db.prepare("SELECT COUNT(*) as c FROM bills").get().c;
  console.log("SC items:", sc, "Marks:", marks, "Bills:", bills);
  if (sc === 0) { console.log("数据库为空，跳过测试"); db.close(); return; }

  // Pick a bill with many items for thorough testing
  const bill = db.prepare("SELECT b.id, b.bill_no, (SELECT COUNT(*) FROM bill_items WHERE bill_id=b.id) as cnt FROM bills b ORDER BY cnt DESC LIMIT 1").get();
  console.log("测试账单:", bill.bill_no, "明细数:", bill.cnt);

  console.log("\n=== 2. 页面可访问性 ===");
  const pages = ["/", "/bills", "/expenses", "/shared-containers"];
  let done = 0;
  pages.forEach(p => get(p, (code) => { console.log(p + ":", code); done++; if (done === pages.length) testExport(); }));

  function testExport() {
    console.log("\n=== 3. 导出接口测试 ===");
    get("/api/bills/export?billId=" + bill.id, async (code, buf) => {
      console.log("Status:", code, "Size:", buf.length, "bytes");
      if (code !== 200) { console.log("导出失败"); db.close(); return; }
      
      const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B;
      console.log("有效 xlsx:", isXlsx);

      const wb = new X.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      
      console.log("\n=== 4. 逐行核对 ===");
      let checks = { data: 0, borderOK: true, notice: false, bank: false, qr: false };
      
      for (let r = 1; r <= Math.min(ws.rowCount, 25); r++) {
        const row = [];
        for (let c = 1; c <= 5; c++) {
          const v = ws.getCell(r, c).value;
          row.push(v != null ? String(v).substring(0, 20).padEnd(20) : ".".repeat(20));
        }
        console.log("R" + String(r).padStart(2) + ": " + row.join(" | "));
        
        // Check data rows (8 onwards with non-empty col 1)
        if (r >= 8 && ws.getCell(r, 1).value != null) {
          const b = ws.getCell(r, 1).border;
          const ok = b && b.top && b.left && b.bottom && b.right;
          if (!ok) checks.borderOK = false;
          if (String(ws.getCell(r, 1).value).match(/^\d{4}-\d{2}-\d{2}/)) checks.data++;
        }
        // Check footer
        const v1 = String(ws.getCell(r, 1).value || '');
        if (v1.includes('工作日')) checks.notice = true;
        if (v1.includes('收款账户') || v1.includes('621226')) checks.bank = true;
      }
      
      // Check images
      checks.qr = ws.getImages().length > 0;

      console.log("\n=== 5. 检查结果 ===");
      console.log("数据行数:", checks.data);
      console.log("边框完整:", checks.borderOK ? "✅" : "❌");
      console.log("提示语:", checks.notice ? "✅" : "❌");
      console.log("银行账号:", checks.bank ? "✅" : "❌");
      console.log("二维码:", checks.qr ? "✅" : "❌");
      
      const allPass = checks.data > 0 && checks.borderOK && checks.notice && checks.bank && checks.qr;
      console.log("\n" + (allPass ? "✅ 全部通过" : "❌ 仍有问题"));
      db.close();
    });
  }
});
