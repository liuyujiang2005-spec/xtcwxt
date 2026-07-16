import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data.db');
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = OFF');

const existing = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='marks_new'").get();
if (existing) {
  console.log('Migration already applied (marks_new exists). Skipping.');
  sqlite.close();
  process.exit(0);
}

sqlite.exec(`
  CREATE TABLE marks_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mark_no TEXT NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    mode TEXT NOT NULL,
    month_tag TEXT NOT NULL,
    remark TEXT,
    receipt_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(mark_no, month_tag)
  );

  INSERT INTO marks_new (id, mark_no, customer_id, mode, month_tag, remark, receipt_url, created_at)
    SELECT id, mark_no, customer_id, mode, month_tag, remark, receipt_url, created_at FROM marks;

  DROP TABLE marks;
  ALTER TABLE marks_new RENAME TO marks;

  CREATE INDEX IF NOT EXISTS marks_month_tag_idx ON marks(month_tag);
  CREATE INDEX IF NOT EXISTS marks_customer_id_idx ON marks(customer_id);
`);

const count = sqlite.prepare('SELECT COUNT(*) as cnt FROM marks').get() as any;
console.log(`Migration complete. ${count.cnt} marks migrated.`);
sqlite.pragma('foreign_keys = ON');
sqlite.close();
