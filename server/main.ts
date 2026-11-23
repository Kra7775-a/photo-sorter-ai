import { createAuth, migrateAuth } from "./auth.ts";
import { loadConfig } from "./config.ts";
import { migrate, openDb } from "./db.ts";
import { createApp } from "./index.ts";

const config = loadConfig(process.env);
const db = openDb(config.dbPath);
migrate(db);
const auth = createAuth(db, config);
await migrateAuth(auth);
const app = createApp({ db, config, auth });
Bun.serve({ port: config.port, fetch: app.fetch });
console.info(`Listening on ${config.baseUrl}`);
