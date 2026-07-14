import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data.db');

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export const rawDb = sqlite;

export function getDb() {
  return db;
}

export function getRawDb() {
  return rawDb;
}

process.on('SIGTERM', () => { rawDb.close(); });
process.on('SIGINT', () => { rawDb.close(); });
