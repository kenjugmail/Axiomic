import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import path from "path";

// Find monorepo root
let rootDir = process.cwd();
while (rootDir !== "/") {
  try {
    const pkg = JSON.parse(require("fs").readFileSync(path.join(rootDir, "package.json"), "utf-8"));
    if (pkg.workspaces) break;
  } catch {}
  rootDir = path.dirname(rootDir);
}

const dbPath = process.env.DATABASE_URL || path.join(rootDir, "axiomic.db");
console.log(`Running migrations on ${dbPath}...`);

const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: path.join(import.meta.dir, "../drizzle") });

console.log("Migrations complete.");
sqlite.close();
