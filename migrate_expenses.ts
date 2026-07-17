import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data.db');
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = OFF');

// Check if migration already done
const existingIdx = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='expenses_batch_type_unique'").get();
if (existingIdx) {
  console.log('Migration already applied (expenses_batch_type_unique exists). Skipping.');
  sqlite.close();
  process.exit(0);
}

// 1. Find duplicates (same loading_batch_id + expense_type)
const dups = sqlite.prepare(`
  SELECT loading_batch_id, expense_type, GROUP_CONCAT(id) as ids, SUM(amount) as total_amount, MAX(id) as keep_id
  FROM expenses
  WHERE loading_batch_id IS NOT NULL
  GROUP BY loading_batch_id, expense_type
  HAVING COUNT(*) > 1
`).all() as any[];

if (dups.length > 0) {
  console.log(`Found ${dups.length} duplicate groups. Merging...`);
  for (const d of dups) {
    const ids = d.ids.split(',').map(Number);
    const keepId = d.keep_id;
    const otherIds = ids.filter((id: number) => id !== keepId);

    // Update payments_made to point to the kept record
    for (const oid of otherIds) {
      sqlite.prepare('UPDATE payments_made SET expense_id = ? WHERE expense_id = ?').run(keepId, oid);
      sqlite.prepare('DELETE FROM expenses WHERE id = ?').run(oid);
    }

    // Update the kept record with the sum
    sqlite.prepare('UPDATE expenses SET amount = ? WHERE id = ?').run(d.total_amount, keepId);
  }
  console.log('Duplicates merged.');
} else {
  console.log('No duplicate expenses found.');
}

// 2. Add unique constraint (SQLite treats NULLs as distinct)
sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS expenses_batch_type_unique ON expenses(loading_batch_id, expense_type)');

const count = sqlite.prepare('SELECT COUNT(*) as cnt FROM expenses').get() as any;
console.log(`Migration complete. ${count.cnt} expense records.`);
sqlite.pragma('foreign_keys = ON');
sqlite.close();
