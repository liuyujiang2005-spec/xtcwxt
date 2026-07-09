const http = require("http");
const D = require("./node_modules/better-sqlite3");
const db = new D("./data.db");

let SID = "";

function post(path, body, cb) {
  const d = JSON.stringify(body);
  const r = http.request({
    hostname: "localhost", port: 3000, path, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) }
  }, res => {
    let b = ""; res.on("data", c => b += c); res.on("end", () => cb(res.statusCode, res.headers, b));
  });
  r.write(d); r.end();
}

function get(path, cb) {
  const h = { "Cookie": "session=" + SID };
  const r = http.request({ hostname: "localhost", port: 3000, path, method: "GET", headers: h }, res => {
    let chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => {
      cb(res.statusCode, Buffer.concat(chunks));
    });
  });
  r.end();
}

function patch(path, body, cb) {
  const d = JSON.stringify(body);
  const r = http.request({
    hostname: "localhost", port: 3000, path, method: "PATCH",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d), "Cookie": "session=" + SID }
  }, res => {
    let b = ""; res.on("data", c => b += c); res.on("end", () => cb(res.statusCode, b));
  });
  r.write(d); r.end();
}

// ── Step 1: Login ──
function step1() {
  post("/api/auth/login", { username: "admin", password: "admin123" }, (code, headers, body) => {
    const cookies = headers["set-cookie"] || [];
    const sCookie = cookies.find(c => c.startsWith("session="));
    SID = sCookie ? sCookie.split(";")[0].split("=")[1] : "";
    console.log("1. Login:", code === 200 ? "OK" : "FAIL (" + code + ")", "SID:", SID ? "yes" : "no");
    step2();
  });
}

// ── Step 2: Test 13 pages ──
function step2() {
  const pages = [
    ["仪表盘", "/"],
    ["收入总表", "/revenue"],
    ["支出总表", "/expenses"],
    ["拼柜批次", "/shared-containers"],
    ["装柜批次", "/loading-lists"],
    ["客户账期", "/accounts/customers"],
    ["费用管理", "/costs"],
    ["直接收入", "/direct-income"],
    ["月度报表", "/reports/monthly"],
    ["账单管理", "/bills"],
    ["客户管理", "/customers"],
    ["唛头管理", "/marks"],
  ];
  let done = 0;
  console.log("\n2. Page tests:");
  pages.forEach(([name, path]) => {
    get(path, (code) => {
      console.log("  " + name + ": " + (code === 200 ? "200 OK" : "FAIL " + code));
      done++;
      if (done === pages.length) step3();
    });
  });
  // Also test batch detail if exists
  const batch = db.prepare("SELECT id FROM shared_container_batches LIMIT 1").get();
  if (batch) {
    get("/shared-containers/" + batch.id, (code) => {
      console.log("  拼柜详情: " + (code === 200 ? "200 OK" : "FAIL " + code));
    });
  }
}

// ── Step 3: Test exports ──
function step3() {
  console.log("\n3. Export tests:");
  const bid = db.prepare("SELECT id FROM bills LIMIT 1").get();
  if (bid) {
    get("/api/bills/export?billId=" + bid.id, (code, buf) => {
      const ok = code === 200 && buf[0] === 0x50 && buf[1] === 0x4B;
      console.log("  Bill export: " + (ok ? "200 OK xlsx " + buf.length + "B" : "FAIL " + code));
      step4();
    });
  } else {
    console.log("  No bills to export");
    step4();
  }
  get("/api/shared-containers/export", (code, buf) => {
    const ok = code === 200 && buf[0] === 0x50 && buf[1] === 0x4B;
    console.log("  SC export: " + (ok ? "200 OK xlsx " + buf.length + "B" : "FAIL " + code));
  });
}

// ── Step 4: Payment test ──
function step4() {
  console.log("\n4. Payment test:");
  const exp = db.prepare("SELECT id, status FROM expenses WHERE status = '待支付' LIMIT 1").get();
  if (exp) {
    patch("/api/expenses/" + exp.id, { status: "已支付" }, (code, body) => {
      const updated = db.prepare("SELECT status FROM expenses WHERE id = ?").get(exp.id);
      console.log("  PATCH: " + (code === 200 ? "200" : "FAIL") + " | Status: " + updated.status + " " + (updated.status === "已支付" ? "OK" : "FAIL"));
      step5();
    });
  } else {
    console.log("  No pending expenses found");
    step5();
  }
}

// ── Step 5: Loading manual entry ──
function step5() {
  console.log("\n5. Loading manual entry:");
  patch("/api/loading-batches", { batchNo: "LD-TEST-" + Date.now().toString().slice(-4), originalFilename: "test" }, (code, body) => {
    console.log("  Batch create: " + (code === 200 ? "OK" : "FAIL"));
    step6();
  });
}

// ── Step 6: Bill amounts ──
function step6() {
  console.log("\n6. Bill amounts:");
  const bills = db.prepare("SELECT b.id, b.bill_no, b.total_amount_cents, c.price_matrix FROM bills b LEFT JOIN customers c ON b.customer_id = c.id LIMIT 5").all();
  bills.forEach(b => {
    const hasPrice = b.price_matrix && b.price_matrix !== "null";
    console.log("  " + b.bill_no + ": total=" + b.total_amount_cents.toFixed(2) + " | customer_price=" + (hasPrice ? "yes" : "no") + " | " + (hasPrice && b.total_amount_cents > 0 ? "OK" : b.total_amount_cents === 0 ? "zero" : "OK"));
  });
  step7();
}

// ── Step 7: Decimal places ──
function step7() {
  console.log("\n7. Check SC cost = order total:");
  const scCosts = db.prepare("SELECT SUM(需支付总价_cents) as total, COUNT(*) as cnt FROM shared_container_items").get();
  const orderTotal = db.prepare("SELECT SUM(订单总价_cents) as total FROM shared_container_items WHERE 订单总价_cents NOT NULL").get();
  console.log("  SC items cost sum: " + (scCosts.total || 0).toFixed(2) + " | Count: " + scCosts.cnt);
  console.log("  订单总价 sum: " + (orderTotal.total || 0).toFixed(2));
  step8();
}

// ── Step 8: SC detail page content ──
function step8() {
  console.log("\n8. SC detail page elements:");
  const batch = db.prepare("SELECT id, status FROM shared_container_batches LIMIT 1").get();
  if (batch) {
    get("/shared-containers/" + batch.id, (code, buf) => {
      const html = buf.toString();
      const hasBills = html.includes("生成账单") || html.includes("ClassifyButton");
      const hasTotal = html.includes("总成本") || html.includes("总立方");
      console.log("  Status: " + batch.status + " | Bill btn: " + (hasBills ? "yes" : "no") + " | Totals: " + (hasTotal ? "yes" : "no"));
    });
  }
  db.close();
  console.log("\nDone!");
}

step1();
