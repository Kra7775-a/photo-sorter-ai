import type { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { Elysia } from "elysia";

import type { Auth } from "./auth.ts";
import { createAuth, createGetSession, migrateAuth } from "./auth.ts";
import type { Config } from "./config.ts";
import { openDb, migrate } from "./db.ts";
import { registerRunRoutes, type CreateRunBody } from "./runs.ts";

const PASSWORD = "correct horse battery staple";

type Api = {
  app: Elysia;
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
  registerRunRoutes(app, { db, config, getSession: createGetSession(auth) });
  holder.app = app;
  return { app, db, server, baseUrl };
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

function post(api: Api, path: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${api.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

function makeRun(index: number, rows = 2): CreateRunBody {
  return {
    clientRunId: `client-${index}`,
    sourceName: `holiday_${index}.zip`,
    createdAt: 1_700_000_000_000 + index,
    counts: { sorted: rows, skipped: 0, errors: 0 },
    rows: Array.from({ length: rows }, (_, i) => ({
      source: `secret_photo_${index}_${i}.jpg`,
      category: "nature",
      score: 0.9,
      status: "sorted" as const,
      error: "",
    })),
  };
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

describe("sort-run API", () => {
  test("rejects anonymous requests with 401 JSON", async () => {
    const res = await post(api, "/api/runs", "", makeRun(99));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "unauthorized" });
    const list = await fetch(`${api.baseUrl}/api/runs`);
    expect(list.status).toBe(401);
  });

  test("stores a run encrypted and returns meta on list, rows on get", async () => {
    const run = makeRun(1);
    const res = await post(api, "/api/runs", cookieA, run);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const raw = api.db.query("SELECT payload, source_name FROM sort_runs WHERE id = ?").get(id) as {
      payload: string;
      source_name: string;
    };
    expect(raw.payload).not.toContain(run.rows[0].source);
    expect(raw.source_name).not.toContain(run.sourceName);

    const list = await fetch(`${api.baseUrl}/api/runs`, { headers: { cookie: cookieA } });
    const listed = (await list.json()) as { runs: Record<string, unknown>[] };
    expect(listed.runs).toHaveLength(1);
    expect(listed.runs[0].sourceName).toBe(run.sourceName);
    expect(listed.runs[0]).not.toHaveProperty("rows");

    const detail = await fetch(`${api.baseUrl}/api/runs/${id}`, { headers: { cookie: cookieA } });
    const full = (await detail.json()) as { rows: typeof run.rows };
    expect(full.rows).toEqual(run.rows);
  });

  test("duplicate clientRunId is idempotent", async () => {
    const run = makeRun(2);
    const first = await post(api, "/api/runs", cookieA, run);
    expect(first.status).toBe(201);
    const { id } = (await first.json()) as { id: string };
    const second = await post(api, "/api/runs", cookieA, run);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ id });
    const rows = api.db
      .query("SELECT COUNT(*) AS n FROM sort_runs WHERE client_run_id = ?")
      .get(run.clientRunId) as { n: number };
    expect(rows.n).toBe(1);
  });

  test("another user cannot see, delete, or list someone else's runs", async () => {
    const created = await post(api, "/api/runs", cookieA, makeRun(3));
    const { id } = (await created.json()) as { id: string };

    const detail = await fetch(`${api.baseUrl}/api/runs/${id}`, { headers: { cookie: cookieB } });
    expect(detail.status).toBe(404);
    expect(await detail.json()).toEqual({ error: "not_found" });

    const deleted = await fetch(`${api.baseUrl}/api/runs/${id}`, {
      method: "DELETE",
      headers: { cookie: cookieB },
    });
    expect(deleted.status).toBe(404);

    const list = await fetch(`${api.baseUrl}/api/runs`, { headers: { cookie: cookieB } });
    const body = (await list.json()) as { runs: unknown[] };
    expect(body.runs).toEqual([]);

    const ownerDelete = await fetch(`${api.baseUrl}/api/runs/${id}`, {
      method: "DELETE",
      headers: { cookie: cookieA },
    });
    expect(ownerDelete.status).toBe(204);
  });

  test("deletes another user's run by client id only for the owner", async () => {
    const created = await post(api, "/api/runs", cookieA, makeRun(31));
    const { id } = (await created.json()) as { id: string };
    const run = makeRun(31);

    const foreign = await fetch(`${api.baseUrl}/api/runs/client/${run.clientRunId}`, {
      method: "DELETE",
      headers: { cookie: cookieB },
    });
    expect(foreign.status).toBe(404);

    const owner = await fetch(`${api.baseUrl}/api/runs/client/${run.clientRunId}`, {
      method: "DELETE",
      headers: { cookie: cookieA },
    });
    expect(owner.status).toBe(204);
    const detail = await fetch(`${api.baseUrl}/api/runs/${id}`, { headers: { cookie: cookieA } });
    expect(detail.status).toBe(404);
  });

  test("enforces row, payload and run-count quotas with 413 JSON", async () => {
    const manyRows = makeRun(4, 20_001);
    const rows = await post(api, "/api/runs", cookieA, manyRows);
    expect(rows.status).toBe(413);
    expect(await rows.json()).toEqual({ error: "quota" });

    const big = makeRun(5, 1);
    big.rows[0].error = "x".repeat(2 * 1024 * 1024 + 1);
    const payload = await post(api, "/api/runs", cookieA, big);
    expect(payload.status).toBe(413);

    // Pre-fill to the per-user run limit, then one more must fail.
    for (let i = 10; i < 10 + 1000; i++) {
      const res = await post(api, "/api/runs", cookieB, makeRun(i));
      expect(res.status).toBe(201);
    }
    const extra = await post(api, "/api/runs", cookieB, makeRun(9999));
    expect(extra.status).toBe(413);
  });

  test("rejects malformed bodies with 400 JSON", async () => {
    const res = await post(api, "/api/runs", cookieA, { clientRunId: 42 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });
});
