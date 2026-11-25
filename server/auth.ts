import type { Database } from "bun:sqlite";

import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";

import type { Config } from "./config.ts";

const SESSION_HINT_COOKIE = "photo-sorter-session";
const SESSION_HINT_MAX_AGE = 30 * 24 * 60 * 60;
const SESSION_START_PATHS = new Set(["/sign-in/email", "/sign-up/email"]);
const SESSION_END_PATHS = new Set(["/sign-out", "/delete-user"]);

/** Better-auth returns `{ success: true }` on sign-out and account deletion. */
function isSuccess(result: unknown): boolean {
  return (
    typeof result === "object" && result !== null && "success" in result && result.success === true
  );
}

function hintCookieOptions(config: Config, maxAge: number) {
  return {
    httpOnly: false,
    path: "/",
    sameSite: "lax" as const,
    secure: config.baseUrl.startsWith("https:"),
    maxAge,
  };
}

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
    user: { deleteUser: { enabled: true } },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        // better-auth's session cookie is HttpOnly, so the SPA cannot use it to
        // decide whether a session might exist. This readable hint only gates
        // that lookup; it is never treated as authentication.
        if (SESSION_START_PATHS.has(ctx.path)) {
          if (ctx.context.newSession) {
            ctx.setCookie(
              SESSION_HINT_COOKIE,
              "1",
              hintCookieOptions(config, SESSION_HINT_MAX_AGE),
            );
          }
          return;
        }

        // Failed sign-outs/deletions keep the session, so keep its hint too.
        if (SESSION_END_PATHS.has(ctx.path) && isSuccess(ctx.context.returned)) {
          ctx.setCookie(SESSION_HINT_COOKIE, "", hintCookieOptions(config, 0));
        }
      }),
    },
    databaseHooks: {
      user: {
        delete: {
          before: async (user) => {
            // No FK cascade exists: app tables are keyed by user_id strings.
            db.query("DELETE FROM sort_runs WHERE user_id = ?").run(user.id);
            db.query("DELETE FROM settings WHERE user_id = ?").run(user.id);
            db.query("DELETE FROM user_keys WHERE user_id = ?").run(user.id);
          },
        },
      },
    },
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
