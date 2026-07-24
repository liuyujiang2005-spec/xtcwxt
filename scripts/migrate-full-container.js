// 整柜(FCL)模块线上库迁移 —— 幂等，可重复运行，只加不改不删。
// 用法(在项目目录下、服务停不停都行，但建议 pm2 stop 后跑更稳)：node scripts/migrate-full-container.js
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(process.cwd(), 'data.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const tableExists = (n) => !!db.prepare("select 1 from sqlite_master where type='table' and name=?").get(n);
const indexExists = (n) => !!db.prepare("select 1 from sqlite_master where type='index' and name=?").get(n);
const colExists = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((r) => r.name === c);
const addCol = (t, c, def) => { if (!colExists(t, c)) { db.exec(`ALTER TABLE ${t} ADD COLUMN ${def}`); console.log(`+ ${t}.${c}`); } else console.log(`= ${t}.${c} 已存在`); };

db.exec('BEGIN');
try {
  if (!tableExists('full_container_batches')) {
    db.exec(`CREATE TABLE full_container_batches (
 id INTEGER PRIMARY KEY AUTOINCREMENT, batch_no TEXT NOT NULL UNIQUE, original_filename TEXT,
 customer_id INTEGER REFERENCES customers(id), month_tag TEXT, currency TEXT DEFAULT 'CNY',
 status TEXT DEFAULT '待验证', 柜型 TEXT, 整柜应收 REAL, 已付 REAL DEFAULT 0, 剩余 REAL, 货物申报价值 REAL,
 国内收货日期 TEXT, 泰国到货日期 TEXT, 出账单日期 TEXT, 实付日期 TEXT,
 created_at TEXT DEFAULT (datetime('now')))`);
    console.log('+ 表 full_container_batches');
  } else console.log('= 表 full_container_batches 已存在');

  if (!tableExists('full_container_items')) {
    db.exec(`CREATE TABLE full_container_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL REFERENCES full_container_batches(id),
 mark_id INTEGER NOT NULL REFERENCES marks(id), customer_id INTEGER NOT NULL REFERENCES customers(id),
 品名 TEXT, 尺寸_长 REAL, 尺寸_宽 REAL, 尺寸_高 REAL, 单项体积 REAL, 总体积 REAL NOT NULL, 国内单号 TEXT,
 单箱数量 INTEGER, 总重量 REAL, 箱数 INTEGER, pcs数量 INTEGER, 仓库 TEXT, 运单号 TEXT, 单价 REAL, 成本单价 REAL,
 需支付总价 REAL, 货型 TEXT, 运输方式 TEXT, payment_status TEXT DEFAULT '待支付', paid_date TEXT,
 created_at TEXT DEFAULT (datetime('now')))`);
    console.log('+ 表 full_container_items');
  } else console.log('= 表 full_container_items 已存在');

  if (!indexExists('fci_batch_id_idx')) { db.exec('CREATE INDEX fci_batch_id_idx ON full_container_items(batch_id)'); console.log('+ 索引 fci_batch_id_idx'); } else console.log('= 索引 fci_batch_id_idx 已存在');
  if (!indexExists('fci_mark_id_idx')) { db.exec('CREATE INDEX fci_mark_id_idx ON full_container_items(mark_id)'); console.log('+ 索引 fci_mark_id_idx'); } else console.log('= 索引 fci_mark_id_idx 已存在');

  addCol('customers', '整柜风控倍数', '整柜风控倍数 INTEGER DEFAULT 1');
  addCol('expenses', 'full_container_batch_id', 'full_container_batch_id INTEGER REFERENCES full_container_batches(id)');
  addCol('customer_metrics', '合作月数', '合作月数 INTEGER');

  if (!indexExists('expenses_fc_batch_type_unique')) { db.exec('CREATE UNIQUE INDEX expenses_fc_batch_type_unique ON expenses(full_container_batch_id, expense_type)'); console.log('+ 唯一索引 expenses_fc_batch_type_unique'); } else console.log('= 唯一索引 expenses_fc_batch_type_unique 已存在');

  db.exec('COMMIT');
  console.log('\n迁移完成。integrity:', db.prepare('PRAGMA integrity_check').get().integrity_check);
} catch (e) {
  db.exec('ROLLBACK');
  console.error('迁移失败，已回滚：', e.message);
  process.exit(1);
} finally {
  db.close();
}
