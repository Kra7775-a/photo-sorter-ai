import type { Database } from "bun:sqlite";

import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

import type { Config } from "./config.ts";

/**
 * Email+password accounts on bun:sqlite. Email verification stays off (no
 * SMTP dependency); telemetry is disabled to keep the server fully offline.
 */
export function createAuth(db: Database, config: Config) {
  return betterAuth({
    database: db,
    secret: config.authSecret,
    baseURL: config.baseUrl,
    emailAndPassword: { enabled: true },
    emailVerification: { sendOnSignUp: false },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Creates better-auth's own tables (user, session, account, verification). */
export async function migrateAuth(auth: Auth): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}

export type GetSession = (req: Request) => Promise<{ userId: string } | null>;

/**
 * Builds the session lookup used by API routes; null means anonymous.
 * A factory keeps the auth instance an explicit dependency instead of
 * module-level state.
 */
export function createGetSession(auth: Auth): GetSession {
  return async (req) => {
    const session = await auth.api.getSession({ headers: req.headers });
    return session ? { userId: session.user.id } : null;
  };
}
