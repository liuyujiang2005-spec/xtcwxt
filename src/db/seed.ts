import Database from 'better-sqlite3';
import path from 'path';
import { hashSync } from 'bcryptjs';

const DB_PATH = path.join(process.cwd(), 'data.db');
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact TEXT,
    price_matrix TEXT,
    enable_min_volume INTEGER DEFAULT 1,
    default_currency TEXT DEFAULT 'CNY',
    remark TEXT
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    contact TEXT,
    default_currency TEXT DEFAULT 'CNY',
    remark TEXT
  );

  CREATE TABLE IF NOT EXISTS marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mark_no TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    mode TEXT NOT NULL,
    month_tag TEXT NOT NULL,
    remark TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shared_container_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_no TEXT NOT NULL UNIQUE,
    total_volume_uploaded REAL NOT NULL,
    status TEXT DEFAULT '待验证',
    original_filename TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shared_container_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES shared_container_batches(id),
    mark_id INTEGER NOT NULL REFERENCES marks(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    品名 TEXT,
    尺寸_长 REAL,
    尺寸_宽 REAL,
    尺寸_高 REAL,
    单箱体积 REAL,
    总体积 REAL NOT NULL,
    国内单号 TEXT,
    单箱数量 INTEGER,
    总重量 REAL,
    箱数 INTEGER,
    pcs数量 INTEGER,
    成本单价_cents REAL,
    需支付总价_cents REAL,
    货型 TEXT,
    运输方式 TEXT,
    客户应收_cents INTEGER,
    订单总价_cents INTEGER,
    运单号 TEXT,
    cost_status TEXT DEFAULT '待支出',
    ai_verified INTEGER DEFAULT 0,
    ai_verify_msg TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS loading_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_no TEXT NOT NULL UNIQUE,
    original_filename TEXT,
    status TEXT DEFAULT '待验证',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS loading_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES loading_batches(id),
    mark_id INTEGER NOT NULL REFERENCES marks(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    品名 TEXT,
    尺寸_长 REAL,
    尺寸_宽 REAL,
    尺寸_高 REAL,
    单箱体积 REAL,
    总体积 REAL NOT NULL,
    国内单号 TEXT,
    单箱数量 INTEGER,
    总重量 REAL,
    箱数 INTEGER,
    pcs数量 INTEGER,
    单价_cents REAL,
    需支付总价_cents REAL,
    货型 TEXT,
    运输方式 TEXT,
    payment_status TEXT DEFAULT '待支付',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS direct_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mark_id INTEGER REFERENCES marks(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'CNY',
    volume REAL,
    income_date TEXT NOT NULL,
    remark TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loading_batch_id INTEGER REFERENCES loading_batches(id),
    expense_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'CNY',
    supplier_id INTEGER REFERENCES suppliers(id),
    status TEXT DEFAULT '待支付',
    paid_date TEXT,
    remark TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments_received (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mark_id INTEGER REFERENCES marks(id),
    customer_id INTEGER REFERENCES customers(id),
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'CNY',
    received_date TEXT NOT NULL,
    remark TEXT
  );

  CREATE TABLE IF NOT EXISTS payments_made (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER REFERENCES suppliers(id),
    expense_id INTEGER REFERENCES expenses(id),
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'CNY',
    paid_date TEXT NOT NULL,
    remark TEXT
  );

  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_no TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    month_tag TEXT NOT NULL,
    total_amount_cents REAL NOT NULL,
    paid_amount REAL DEFAULT 0,
    remaining_amount REAL DEFAULT 0,
    payment_status TEXT DEFAULT '待付款',
    exported_at TEXT,
    paid_at TEXT,
    currency TEXT DEFAULT 'CNY',
    status TEXT DEFAULT '待生成',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL REFERENCES bills(id),
    mark_id INTEGER NOT NULL REFERENCES marks(id),
    mode TEXT NOT NULL,
    amount_cents REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customer_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id) UNIQUE,
    avg_payment_days INTEGER,
    monthly_volume REAL,
    monthly_shipments INTEGER,
    overdue_count INTEGER,
    overall_rating TEXT,
    last_updated TEXT
  );

  CREATE INDEX IF NOT EXISTS marks_month_tag_idx ON marks(month_tag);
  CREATE INDEX IF NOT EXISTS marks_customer_id_idx ON marks(customer_id);
  CREATE INDEX IF NOT EXISTS sci_batch_id_idx ON shared_container_items(batch_id);
  CREATE INDEX IF NOT EXISTS sci_mark_id_idx ON shared_container_items(mark_id);
  CREATE INDEX IF NOT EXISTS sci_customer_id_idx ON shared_container_items(customer_id);
  CREATE INDEX IF NOT EXISTS li_batch_id_idx ON loading_items(batch_id);
  CREATE INDEX IF NOT EXISTS li_mark_id_idx ON loading_items(mark_id);
  CREATE INDEX IF NOT EXISTS di_customer_id_idx ON direct_income(customer_id);
  CREATE INDEX IF NOT EXISTS di_income_date_idx ON direct_income(income_date);
  CREATE INDEX IF NOT EXISTS exp_type_idx ON expenses(expense_type);
  CREATE INDEX IF NOT EXISTS exp_status_idx ON expenses(status);
  CREATE INDEX IF NOT EXISTS payments_received_customer_id_idx ON payments_received(customer_id);
  CREATE INDEX IF NOT EXISTS bills_customer_month_idx ON bills(customer_id, month_tag);
  CREATE INDEX IF NOT EXISTS bi_bill_id_idx ON bill_items(bill_id);
`);

const existingAdmin = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existingAdmin) {
  const passwordHash = hashSync('admin123', 10);
  sqlite.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  ).run('admin', passwordHash, '系统管理员', 'admin');
  console.log('Admin user created: admin / admin123');
} else {
  console.log('Admin user already exists');
}

console.log('Database initialized successfully');
sqlite.close();
