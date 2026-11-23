import type { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { Elysia } from "elysia";

import type { Auth } from "./auth.ts";
import { createAuth, createGetSession, migrateAuth } from "./auth.ts";
import type { Config } from "./config.ts";
import { migrate, openDb } from "./db.ts";
import { registerSettingsRoutes } from "./settings.ts";

const PASSWORD = "correct horse battery staple";
const UPDATED_AT = 1_700_000_000_000;

type Api = {
  db: Database;
  server: ReturnType<typeof Bun.serve>;
  baseUrl: string;
};

async function setup(): Promise<Api> {
  const db = openDb(":memory:");
  migrate(db);
  const holder: { app?: Elysia } = {};
  const server = Bun.serve({ port: 0, fetch: (req) => holder.app!.fetch(req) });
  const baseUrl = `http://localhost:${server.port ?? 0}`;
  const config: Config = {
    masterKey: crypto.getRandomValues(new Uint8Array(32)),
    authSecret: "test-secret-not-a-real-one",
    dbPath: ":memory:",
    port: server.port ?? 0,
    baseUrl,
  };
  const auth: Auth = createAuth(db, config);
  await migrateAuth(auth);

  const app: Elysia = new Elysia();
  app.all("/api/auth/*", ({ request }) => auth.handler(request));
  registerSettingsRoutes(app, { db, config, getSession: createGetSession(auth) });
  holder.app = app;
  return { db, server, baseUrl };
}

async function signUp(api: Api, email: string): Promise<string> {
  const res = await fetch(`${api.baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: api.baseUrl },
    body: JSON.stringify({ email, password: PASSWORD, name: email.split("@")[0] }),
  });
  expect(res.status).toBe(200);
  return String(res.headers.get("set-cookie") ?? "").split(";")[0];
}

function put(api: Api, cookie: string, body: unknown, raw = false): Promise<Response> {
  return fetch(`${api.baseUrl}/api/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

function get(api: Api, cookie: string): Promise<Response> {
  return fetch(`${api.baseUrl}/api/settings`, { headers: { cookie } });
}

let api: Api;
let cookieA: string;
let cookieB: string;

beforeAll(async () => {
  api = await setup();
  cookieA = await signUp(api, "alice@example.com");
  cookieB = await signUp(api, "bob@example.com");
});

afterAll(async () => {
  await api.server.stop(true);
  api.db.close();
});

describe("settings API", () => {
  test("rejects anonymous requests with 401 JSON", async () => {
    const read = await get(api, "");
    expect(read.status).toBe(401);
    expect(read.headers.get("content-type")).toContain("application/json");
    expect(await read.json()).toEqual({ error: "unauthorized" });

    const write = await put(api, "", { payload: { labels: [] }, updatedAt: UPDATED_AT });
    expect(write.status).toBe(401);
    expect(await write.json()).toEqual({ error: "unauthorized" });
  });

  test("returns JSON null for a user without settings and keeps users isolated", async () => {
    const res = await get(api, cookieB);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toBeNull();
  });

  test("round-trips labels through PUT and GET and stores them encrypted", async () => {
    const body = { payload: { labels: ["nature", "people"] }, updatedAt: UPDATED_AT };
    const saved = await put(api, cookieA, body);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual(body);

    const raw = api.db.query("SELECT payload FROM settings").get() as { payload: string };
    expect(raw.payload).not.toContain("nature");
    expect(raw.payload).not.toContain("people");

    const res = await get(api, cookieA);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);

    const other = await get(api, cookieB);
    expect(await other.json()).toBeNull();
  });

  test("ignores an older updatedAt but returns the current value", async () => {
    const stale = {
      payload: { labels: ["stale"] },
      updatedAt: UPDATED_AT - 1,
    };
    const res = await put(api, cookieA, stale);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      payload: { labels: ["nature", "people"] },
      updatedAt: UPDATED_AT,
    });

    const raw = api.db.query("SELECT payload, updated_at FROM settings").get() as {
      payload: string;
      updated_at: number;
    };
    expect(raw.updated_at).toBe(UPDATED_AT);
    expect(raw.payload).not.toContain("stale");
  });

  test("rejects malformed bodies with 400 JSON", async () => {
    const badJson = await put(api, cookieA, "{", true);
    expect(badJson.status).toBe(400);
    expect(badJson.headers.get("content-type")).toContain("application/json");
    expect(await badJson.json()).toEqual({ error: "invalid_json" });

    const badBody = await put(api, cookieA, { payload: "labels", updatedAt: "now" });
    expect(badBody.status).toBe(400);
    expect(await badBody.json()).toEqual({ error: "invalid_body" });
  });
});
