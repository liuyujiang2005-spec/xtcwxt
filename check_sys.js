const http = require("http");
const D = require("./node_modules/better-sqlite3");
const db = new D("./data.db");
let SID = "";

function login(cb) {
  const d = JSON.stringify({ username: "admin", password: "admin123" });
  const r = http.request({ hostname: "localhost", port: 3000, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } }, res => {
    let b = ""; res.on("data", c => b += c); res.on("end", () => {
      const sc = (res.headers["set-cookie"] || []).find(c => c.startsWith("session="));
      SID = sc ? sc.split(";")[0].split("=")[1] : "";
      console.log("Login:", res.statusCode === 200 ? "OK" : "FAIL");
      cb();
    });
  });
  r.write(d); r.end();
}

function get(path, cb) {
  http.request({ hostname: "localhost", port: 3000, path, method: "GET", headers: { "Cookie": "session=" + SID } }, res => cb(res.statusCode)).end();
}

login(() => {
  const pages = [
    ["仪表盘", "/"], ["收入总表", "/revenue"], ["支出总表", "/expenses"],
    ["拼柜批次", "/shared-containers"], ["装柜批次", "/loading-lists"],
    ["客户账期", "/accounts/customers"], ["账单管理", "/bills"],
    ["客户管理", "/customers"], ["唛头管理", "/marks"],
    ["月度报表", "/reports/monthly"], ["直接收入", "/direct-income"],
  ];
  let done = 0;
  pages.forEach(([n, p]) => {
    get(p, c => {
      console.log(n + ":", c === 200 ? "OK" : "ERR " + c);
      done++;
      if (done === pages.length) {
        console.log("\n--- DB ---");
        console.log("SC items:", db.prepare("SELECT COUNT(*) as c FROM shared_container_items").get().c);
        console.log("Marks:", db.prepare("SELECT COUNT(*) as c FROM marks").get().c);
        console.log("Bills:", db.prepare("SELECT COUNT(*) as c FROM bills").get().c);
        console.log("Expenses:", db.prepare("SELECT COUNT(*) as c FROM expenses").get().c);
        const r = db.prepare("SELECT COUNT(*) as c FROM bills WHERE receipt_url IS NOT NULL").get();
        console.log("Bills with receipt:", r.c);
        db.close();
      }
    });
  });
});
