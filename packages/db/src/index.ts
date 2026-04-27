import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export * from "./schema";
export { schema };

let _db: ReturnType<typeof createDb> | null = null;

function createDb(url?: string) {
  const sqlite = new Database(url || process.env.DATABASE_URL || "./axiomic.db");
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export function getDb(url?: string) {
  if (!_db) {
    _db = createDb(url);
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;
