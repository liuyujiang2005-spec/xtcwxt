const fs = require("fs");
const bcrypt = require("bcryptjs");
const D = require("./node_modules/better-sqlite3");

// Update seed.ts
let s = fs.readFileSync("src/db/seed.ts", "utf8");
s = s.replace("admin123", "Aa112233");
fs.writeFileSync("src/db/seed.ts", s);
console.log("seed.ts updated");

// Update current DB
const d = new D("./data.db");
const hash = bcrypt.hashSync("Aa112233", 10);
d.prepare("UPDATE users SET password_hash = ? WHERE username = ?").run(hash, "admin");
console.log("DB password updated");
d.close();
