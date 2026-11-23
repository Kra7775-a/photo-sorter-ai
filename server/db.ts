import { Database } from "bun:sqlite";

/**
 * Ordered SQL migrations. After applying migration i, PRAGMA user_version
 * is set to i + 1, so migrate() only ever runs pending migrations.
 * better-auth creates its own tables separately.
 */
const migrations: string[] = [
  `
  CREATE TABLE user_keys (
    user_id TEXT PRIMARY KEY,
    wrapped_key TEXT NOT NULL,
    key_version INTEGER NOT NULL
  );

  CREATE TABLE sort_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    client_run_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    counts_json TEXT NOT NULL,
    payload TEXT NOT NULL,
    scheme TEXT NOT NULL,
    key_version INTEGER NOT NULL,
    UNIQUE (user_id, client_run_id)
  );

  CREATE TABLE settings (
    user_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    scheme TEXT NOT NULL,
    key_version INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
];

export function openDb(path: string): Database {
  return new Database(path);
}

export function migrate(db: Database): void {
  const row = db.query("PRAGMA user_version").get() as { user_version: number };
  const apply = db.transaction((sql: string, version: number) => {
    db.exec(sql);
    db.exec(`PRAGMA user_version = ${version}`);
  });
  for (let i = row.user_version; i < migrations.length; i++) {
    apply(migrations[i], i + 1);
  }
}
