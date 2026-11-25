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

/** Finds one raw Set-Cookie header by name. */
function setCookie(res: Response, name: string): string | null {
  return res.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`)) ?? null;
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
  test("sign-up returns 200 with the new user and sets the readable hint", async () => {
    const res = await post("/api/auth/sign-up/email", { email, password, name: "Alice" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthBody;
    expect(body.user.email).toBe(email);

    const hint = setCookie(res, "photo-sorter-session");
    expect(hint).toContain("photo-sorter-session=1");
    expect(hint).toContain("Max-Age=2592000");
    expect(hint).toContain("Path=/");
    expect(hint).toContain("SameSite=Lax");
    expect(hint).not.toContain("HttpOnly");
    expect(hint).not.toContain("Secure");
  });

  test("sign-in sets a session cookie and the readable hint", async () => {
    const res = await post("/api/auth/sign-in/email", { email, password });
    expect(res.status).toBe(200);
    sessionCookie = cookieFrom(res);
    expect(sessionCookie).toContain("better-auth.session_token=");
    expect(setCookie(res, "photo-sorter-session")).toContain("photo-sorter-session=1");
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

  test("sign-in with a wrong password returns 401 and no hint", async () => {
    const res = await post("/api/auth/sign-in/email", { email, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(setCookie(res, "photo-sorter-session")).toBeNull();
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

  test("sign-out clears the readable hint", async () => {
    const res = await fetch(url("/api/auth/sign-out"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
        origin: `http://localhost:${server.port}`,
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const hint = setCookie(res, "photo-sorter-session");
    expect(hint).toContain("photo-sorter-session=;");
    expect(hint).toContain("Max-Age=0");
    expect(hint).toContain("Path=/");
    expect(hint).toContain("SameSite=Lax");
    expect(hint).not.toContain("HttpOnly");
  });

  test("deleting an account cascades to app metadata", async () => {
    const signup = await post("/api/auth/sign-up/email", {
      email: "delete-me@example.com",
      password,
      name: "Delete",
    });
    expect(signup.status).toBe(200);
    const body = (await signup.json()) as AuthBody;
    const cookie = cookieFrom(signup);
    const id = body.user.id;

    const wrongPassword = await fetch(url("/api/auth/delete-user"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: `http://localhost:${server.port}`,
      },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    expect(wrongPassword.status).toBe(400);
    expect(setCookie(wrongPassword, "photo-sorter-session")).toBeNull();

    db.query("INSERT INTO user_keys (user_id, wrapped_key, key_version) VALUES (?, ?, 1)").run(
      id,
      "wrapped",
    );
    db.query(
      "INSERT INTO settings (user_id, payload, scheme, key_version, updated_at) VALUES (?, ?, ?, 1, 1)",
    ).run(id, "payload", "server-v1");

    const res = await fetch(url("/api/auth/delete-user"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: `http://localhost:${server.port}`,
      },
      body: JSON.stringify({ password }),
    });
    expect(res.status).toBe(200);
    const hint = setCookie(res, "photo-sorter-session");
    expect(hint).toContain("photo-sorter-session=;");
    expect(hint).toContain("Max-Age=0");

    for (const table of ["user", "user_keys", "settings", "sort_runs"]) {
      const where = table === "user" ? "id = ?" : "user_id = ?";
      const row = db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(id) as {
        n: number;
      };
      expect(row.n).toBe(0);
    }
  });
});
