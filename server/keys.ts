import type { Database } from "bun:sqlite";

import { generateDataKey, unwrapKey, wrapKey, type SealedBlob } from "./crypto.ts";

/** Generates a canonical base64 master key (32 random bytes) for SYNC_MASTER_KEY. */
export function generateMasterKey(): string {
  return Buffer.from(generateDataKey()).toString("base64");
}

/** Lazily creates a per-user data key wrapped by the master key. */
export function getDataKey(db: Database, masterKey: Uint8Array, userId: string): Uint8Array {
  const row = db
    .query("SELECT wrapped_key, key_version FROM user_keys WHERE user_id = ?")
    .get(userId) as { wrapped_key: string; key_version: number } | undefined;
  if (row) {
    return unwrapKey(masterKey, JSON.parse(row.wrapped_key) as SealedBlob);
  }
  const key = generateDataKey();
  const wrapped = wrapKey(masterKey, key);
  db.query("INSERT INTO user_keys (user_id, wrapped_key, key_version) VALUES (?, ?, ?)").run(
    userId,
    JSON.stringify(wrapped),
    wrapped.keyVersion,
  );
  return key;
}
