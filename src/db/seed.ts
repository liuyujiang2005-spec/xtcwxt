import Database from 'better-sqlite3';
import path from 'path';
import { hashSync } from 'bcryptjs';

const DB_PATH = path.join(process.cwd(), 'data.db');
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Create tables
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

  CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_no TEXT NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id),
    shipment_type TEXT NOT NULL,
    goods_type TEXT NOT NULL,
    volume REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    total_receivable_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'CNY',
    status TEXT DEFAULT '运输中',
    month_tag TEXT NOT NULL,
    bl_no TEXT,
    container_no TEXT,
    etd TEXT,
    eta_bkk TEXT,
    remark TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shipment_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER REFERENCES shipments(id),
    cost_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'CNY',
    supplier_id INTEGER REFERENCES suppliers(id),
    remark TEXT
  );

  CREATE TABLE IF NOT EXISTS payments_received (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id),
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'CNY',
    received_date TEXT NOT NULL,
    remark TEXT
  );

  CREATE TABLE IF NOT EXISTS payment_shipment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_received_id INTEGER REFERENCES payments_received(id),
    shipment_id INTEGER REFERENCES shipments(id),
    amount_cents INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments_made (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER REFERENCES suppliers(id),
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'CNY',
    paid_date TEXT NOT NULL,
    shipment_id INTEGER REFERENCES shipments(id),
    cost_type TEXT,
    remark TEXT
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no TEXT NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id),
    type TEXT,
    status TEXT DEFAULT '待开',
    total_amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'CNY',
    issue_date TEXT,
    due_date TEXT,
    remark TEXT
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER REFERENCES invoices(id),
    shipment_id INTEGER REFERENCES shipments(id),
    amount_cents INTEGER NOT NULL
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

  CREATE INDEX IF NOT EXISTS shipments_month_tag_idx ON shipments(month_tag);
  CREATE INDEX IF NOT EXISTS shipments_customer_id_idx ON shipments(customer_id);
  CREATE INDEX IF NOT EXISTS shipment_costs_shipment_id_idx ON shipment_costs(shipment_id);
  CREATE INDEX IF NOT EXISTS payments_received_customer_id_idx ON payments_received(customer_id);
  CREATE INDEX IF NOT EXISTS payment_alloc_shipment_id_idx ON payment_shipment_allocations(shipment_id);
  CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON invoices(customer_id);
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
