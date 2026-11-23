import type { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { Auth } from "./auth.ts";
import { createAuth, createGetSession, migrateAuth } from "./auth.ts";
import type { Config } from "./config.ts";
import { migrate, openDb } from "./db.ts";
import { createApp } from "./index.ts";

const email = "alice@example.com";
const password = "test-password-123";

type AuthBody = { user: { id: string; email: string } };

let server: ReturnType<typeof Bun.serve>;
let db: Database;
let auth: Auth;
let sessionCookie = "";
let userId = "";

/** Collects set-cookie headers into a single Cookie request header value. */
function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function url(path: string): string {
  return `http://localhost:${server.port}${path}`;
}

function post(path: string, body: Record<string, string>): Promise<Response> {
  return fetch(url(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  db = openDb(":memory:");
  migrate(db);
  // Port 0 lets the OS pick a free port; the fetch wrapper defers to the app
  // so better-auth's baseURL can match the real origin once it is known.
  const holder: { app?: ReturnType<typeof createApp> } = {};
  server = Bun.serve({ port: 0, fetch: (req) => holder.app!.fetch(req) });
  const port = server.port ?? 0;
  const config: Config = {
    masterKey: crypto.getRandomValues(new Uint8Array(32)),
    authSecret: "test-secret-not-a-real-one",
    dbPath: ":memory:",
    port,
    baseUrl: `http://localhost:${port}`,
  };
  auth = createAuth(db, config);
  await migrateAuth(auth);
  holder.app = createApp({ db, config, auth });
});

afterAll(async () => {
  await server.stop(true);
  db.close();
});

describe("email+password accounts", () => {
  test("sign-up returns 200 with the new user", async () => {
    const res = await post("/api/auth/sign-up/email", { email, password, name: "Alice" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthBody;
    expect(body.user.email).toBe(email);
  });

  test("sign-in sets a session cookie", async () => {
    const res = await post("/api/auth/sign-in/email", { email, password });
    expect(res.status).toBe(200);
    sessionCookie = cookieFrom(res);
    expect(sessionCookie).toContain("better-auth.session_token=");
  });

  test("get-session with the cookie returns the user email", async () => {
    const res = await fetch(url("/api/auth/get-session"), {
      headers: { cookie: sessionCookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthBody;
    expect(body.user.email).toBe(email);
    userId = body.user.id;
  });

  test("sign-in with a wrong password returns 401", async () => {
    const res = await post("/api/auth/sign-in/email", { email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  test("get-session without a cookie returns a null session", async () => {
    const res = await fetch(url("/api/auth/get-session"));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  test("getSession helper maps a cookie to userId and no cookie to null", async () => {
    const getSession = createGetSession(auth);
    const withCookie = await getSession(
      new Request(url("/api/runs"), { headers: { cookie: sessionCookie } }),
    );
    expect(withCookie).toEqual({ userId });
    const anonymous = await getSession(new Request(url("/api/runs")));
    expect(anonymous).toBeNull();
  });
});
