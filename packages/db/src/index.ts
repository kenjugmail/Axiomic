import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readFileSync } from "fs";
import * as schema from "./schema";
import path from "path";

export * from "./schema";
export { schema };

let _db: ReturnType<typeof createDb> | null = null;

function findDbPath(): string {
  // Walk up from cwd to find monorepo root (has package.json with workspaces)
  let dir = process.cwd();
  while (dir !== "/") {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"));
      if (pkg.workspaces) {
        return path.join(dir, "axiomic.db");
      }
    } catch {}
    dir = path.dirname(dir);
  }
  return path.join(process.cwd(), "axiomic.db");
}

function createDb(url?: string) {
  const dbPath = url || process.env.DATABASE_URL || findDbPath();
  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA busy_timeout = 5000");
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
