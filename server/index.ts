import type { Database } from "bun:sqlite";

import { Hono } from "hono";

import { loadConfig, type Config } from "./config.ts";
import { migrate, openDb } from "./db.ts";

/** Builds the API app; deps are explicit so tests never need env secrets. */
export function createApp(_deps: { db: Database; config: Config }): Hono {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ status: "ok" }));
  return app;
}

if (import.meta.main) {
  const config = loadConfig(process.env);
  const db = openDb(config.dbPath);
  migrate(db);
  const app = createApp({ db, config });
  Bun.serve({ port: config.port, fetch: app.fetch });
  console.info(`Listening on ${config.baseUrl}`);
}
