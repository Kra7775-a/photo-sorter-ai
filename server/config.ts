export type Config = {
  masterKey: Uint8Array;
  authSecret: string;
  dbPath: string;
  port: number;
  baseUrl: string;
};

const MASTER_KEY_BYTES = 32;

/** Reads server settings from env; secrets are required and never defaulted. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const rawKey = env.SYNC_MASTER_KEY;
  if (!rawKey) {
    throw new Error("SYNC_MASTER_KEY is required (base64-encoded 32-byte key)");
  }
  const masterKey = new Uint8Array(Buffer.from(rawKey, "base64"));
  if (masterKey.length !== MASTER_KEY_BYTES) {
    throw new Error(
      `SYNC_MASTER_KEY must decode to ${MASTER_KEY_BYTES} bytes, got ${masterKey.length}`,
    );
  }

  const authSecret = env.BETTER_AUTH_SECRET;
  if (!authSecret) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }

  const port = Number(env.PORT ?? "3001");
  return {
    masterKey,
    authSecret,
    dbPath: env.SYNC_DB_PATH ?? "sync.db",
    port,
    baseUrl: env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
  };
}
