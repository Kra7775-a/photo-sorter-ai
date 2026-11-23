import { loadConfig } from "./config.ts";
import { migrate, openDb } from "./db.ts";
import { createApp } from "./index.ts";

const config = loadConfig(process.env);
const db = openDb(config.dbPath);
migrate(db);
const app = createApp({ db, config });
Bun.serve({ port: config.port, fetch: app.fetch });
console.info(`Listening on ${config.baseUrl}`);
