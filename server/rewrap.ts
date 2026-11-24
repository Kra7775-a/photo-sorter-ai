import { Database } from "bun:sqlite";

import type { SealedBlob } from "./crypto.ts";
import { unwrapKey, wrapKey } from "./crypto.ts";

/**
 * Rewraps per-user data keys after SYNC_MASTER_KEY rotation.
 * Usage: OLD_SYNC_MASTER_KEY=<old> SYNC_MASTER_KEY=<new> bun server/rewrap.ts
 */
function keyFromEnv(name: string): Uint8Array {
  const raw = process.env[name];

  if (!raw) {
    throw new Error(`${name} is required (base64-encoded 32-byte key)`);
  }
  const key = new Uint8Array(Buffer.from(raw, "base64"));

  if (key.length !== 32) {
    throw new Error(`${name} must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}

const oldMaster = keyFromEnv("OLD_SYNC_MASTER_KEY");
const newMaster = keyFromEnv("SYNC_MASTER_KEY");
const db = new Database(process.env.SYNC_DB_PATH ?? "sync.db");
const rows = db.query("SELECT user_id, wrapped_key, key_version FROM user_keys").all() as {
  user_id: string;
  wrapped_key: string;
  key_version: number;
}[];
const update = db.query("UPDATE user_keys SET wrapped_key = ?, key_version = ? WHERE user_id = ?");

for (const row of rows) {
  const dataKey = unwrapKey(oldMaster, JSON.parse(row.wrapped_key) as SealedBlob);
  const wrapped = wrapKey(newMaster, dataKey);
  update.run(JSON.stringify(wrapped), wrapped.keyVersion, row.user_id);
}

console.info(`Rewrapped ${rows.length} user key(s).`);
db.close();
