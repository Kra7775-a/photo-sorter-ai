import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { loadConfig } from "./config.ts";
import { migrate, openDb } from "./db.ts";

type Column = { name: string; type: string; notnull: number; pk: number };

function columns(db: Database, table: string): Column[] {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Column[];
  return rows.map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }));
}

function tableNames(db: Database): string[] {
  const rows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name).sort();
}

function userVersion(db: Database): number {
  const row = db.query("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

const masterBytes = crypto.getRandomValues(new Uint8Array(32));
const masterKeyB64 = Buffer.from(masterBytes).toString("base64");

describe("migrate", () => {
  test("creates the three application tables with the exact columns", () => {
    const db = openDb(":memory:");
    migrate(db);

    expect(tableNames(db)).toEqual(["settings", "sort_runs", "user_keys"]);

    expect(columns(db, "user_keys")).toEqual([
      { name: "user_id", type: "TEXT", notnull: 0, pk: 1 },
      { name: "wrapped_key", type: "TEXT", notnull: 1, pk: 0 },
      { name: "key_version", type: "INTEGER", notnull: 1, pk: 0 },
    ]);

    expect(columns(db, "sort_runs")).toEqual([
      { name: "id", type: "TEXT", notnull: 0, pk: 1 },
      { name: "user_id", type: "TEXT", notnull: 1, pk: 0 },
      { name: "client_run_id", type: "TEXT", notnull: 1, pk: 0 },
      { name: "source_name", type: "TEXT", notnull: 1, pk: 0 },
      { name: "created_at", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "counts_json", type: "TEXT", notnull: 1, pk: 0 },
      { name: "payload", type: "TEXT", notnull: 1, pk: 0 },
      { name: "scheme", type: "TEXT", notnull: 1, pk: 0 },
      { name: "key_version", type: "INTEGER", notnull: 1, pk: 0 },
    ]);

    expect(columns(db, "settings")).toEqual([
      { name: "user_id", type: "TEXT", notnull: 0, pk: 1 },
      { name: "payload", type: "TEXT", notnull: 1, pk: 0 },
      { name: "scheme", type: "TEXT", notnull: 1, pk: 0 },
      { name: "key_version", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "updated_at", type: "INTEGER", notnull: 1, pk: 0 },
    ]);

    db.close();
  });

  test("enforces UNIQUE(user_id, client_run_id) on sort_runs", () => {
    const db = openDb(":memory:");
    migrate(db);

    const insert = db.query(
      "INSERT INTO sort_runs (id, user_id, client_run_id, source_name, created_at, counts_json, payload, scheme, key_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run("run-1", "user-1", "client-1", "a.zip", 1, "{}", "blob", "server-v1", 1);

    expect(() =>
      insert.run("run-2", "user-1", "client-1", "b.zip", 2, "{}", "blob", "server-v1", 1),
    ).toThrow();

    db.close();
  });

  test("a second migrate call is a no-op and keeps data", () => {
    const db = openDb(":memory:");
    migrate(db);
    const version = userVersion(db);
    expect(version).toBeGreaterThan(0);

    db.query("INSERT INTO user_keys (user_id, wrapped_key, key_version) VALUES (?, ?, ?)").run(
      "user-1",
      "blob",
      1,
    );

    expect(() => migrate(db)).not.toThrow();
    expect(userVersion(db)).toBe(version);
    expect(tableNames(db)).toEqual(["settings", "sort_runs", "user_keys"]);
    expect(db.query("SELECT COUNT(*) AS n FROM user_keys").get()).toEqual({ n: 1 });

    db.close();
  });
});

describe("loadConfig", () => {
  test("throws mentioning SYNC_MASTER_KEY when the key is missing", () => {
    expect(() => loadConfig({})).toThrow(/SYNC_MASTER_KEY/);
  });

  test("throws mentioning BETTER_AUTH_SECRET when the secret is missing", () => {
    expect(() => loadConfig({ SYNC_MASTER_KEY: masterKeyB64 })).toThrow(/BETTER_AUTH_SECRET/);
  });

  test("rejects a master key that does not decode to 32 bytes", () => {
    const shortKey = Buffer.from("too-short").toString("base64");
    expect(() =>
      loadConfig({ SYNC_MASTER_KEY: shortKey, BETTER_AUTH_SECRET: "test-secret" }),
    ).toThrow(/SYNC_MASTER_KEY/);
  });

  test("decodes a valid 32-byte base64 master key and applies defaults", () => {
    const config = loadConfig({
      SYNC_MASTER_KEY: masterKeyB64,
      BETTER_AUTH_SECRET: "test-secret",
    });

    expect(config.masterKey.length).toBe(32);
    expect(config.masterKey).toEqual(masterBytes);
    expect(config.authSecret).toBe("test-secret");
    expect(config.dbPath).toBe("sync.db");
    expect(config.port).toBe(3001);
    expect(config.baseUrl).toBe("http://localhost:3001");
  });
});
