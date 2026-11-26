import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

import type { Elysia } from "elysia";

import type { Counts } from "#shared/counts";

import type { GetSession } from "./auth.ts";
import type { Config } from "./config.ts";
import { open, seal, type SealedBlob } from "./crypto.ts";
import { getDataKey } from "./keys.ts";

/** Structural copy of ReportRow from src/lib/archive/naming.ts (server must not import src/). */
export type ReportRow = {
  source: string;
  category: string;
  score: number | null;
  margin?: number | null;
  candidate?: string;
  runnerUp?: string | null;
  status: "sorted" | "skipped" | "error" | "review";
  error: string;
};

export type CreateRunBody = {
  clientRunId: string;
  sourceName: string;
  createdAt: number;
  counts: Counts;
  rows: ReportRow[];
};

export type RunMeta = {
  id: string;
  clientRunId: string;
  sourceName: string;
  createdAt: number;
  counts: Counts;
};

export type RunDeps = {
  db: Database;
  config: Config;
  getSession: GetSession;
};

const MAX_RUNS = 1000;
const MAX_ROWS = 20_000;
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

type RunRow = {
  id: string;
  user_id: string;
  client_run_id: string;
  source_name: string;
  created_at: number;
  counts_json: string;
  payload: string;
  scheme: string;
  key_version: number;
};

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function toMeta(deps: RunDeps, userId: string, row: RunRow): RunMeta {
  const key = getDataKey(deps.db, deps.config.masterKey, userId);
  const nameBlob = JSON.parse(row.source_name) as SealedBlob;
  return {
    id: row.id,
    clientRunId: row.client_run_id,
    sourceName: Buffer.from(open(key, nameBlob, `${userId}|${row.id}|name|server-v1`)).toString(
      "utf8",
    ),
    createdAt: row.created_at,
    counts: JSON.parse(row.counts_json) as Counts,
  };
}

function validBody(value: unknown): value is CreateRunBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const body = value as Record<string, unknown>;
  if (typeof body.clientRunId !== "string" || !body.clientRunId) {
    return false;
  }
  if (typeof body.sourceName !== "string") {
    return false;
  }
  if (typeof body.createdAt !== "number") {
    return false;
  }
  const counts = body.counts as Record<string, unknown> | undefined;
  if (
    !counts ||
    typeof counts.sorted !== "number" ||
    typeof counts.skipped !== "number" ||
    typeof counts.errors !== "number" ||
    (counts.review !== undefined && typeof counts.review !== "number")
  ) {
    return false;
  }
  return Array.isArray(body.rows);
}

function findRun(db: Database, id: string, userId: string): RunRow | undefined {
  return db.query("SELECT * FROM sort_runs WHERE id = ? AND user_id = ?").get(id, userId) as
    | RunRow
    | undefined;
}

/** Registers encrypted, per-user sort-run endpoints on an Elysia app. */
export function registerRunRoutes(app: Elysia, deps: RunDeps): void {
  app.post("/api/runs", async ({ request }) => {
    const session = await deps.getSession(request);
    if (!session) {
      return jsonError(401, "unauthorized");
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "invalid_json");
    }
    if (!validBody(body)) {
      return jsonError(400, "invalid_body");
    }
    const input = body;

    const count = deps.db
      .query("SELECT COUNT(*) AS n FROM sort_runs WHERE user_id = ?")
      .get(session.userId) as { n: number };
    const existing = deps.db
      .query("SELECT id FROM sort_runs WHERE user_id = ? AND client_run_id = ?")
      .get(session.userId, input.clientRunId) as { id: string } | undefined;
    if (existing) {
      return { id: existing.id };
    }

    if (
      count.n >= MAX_RUNS ||
      input.rows.length > MAX_ROWS ||
      Buffer.byteLength(JSON.stringify(input.rows), "utf8") > MAX_PAYLOAD_BYTES
    ) {
      return jsonError(413, "quota");
    }

    const id = randomUUID();
    const key = getDataKey(deps.db, deps.config.masterKey, session.userId);
    const name = seal(
      key,
      Buffer.from(input.sourceName, "utf8"),
      `${session.userId}|${id}|name|server-v1`,
    );
    const payload = seal(
      key,
      Buffer.from(JSON.stringify(input.rows), "utf8"),
      `${session.userId}|${id}|server-v1`,
    );
    deps.db
      .query(
        `INSERT INTO sort_runs
          (id, user_id, client_run_id, source_name, created_at, counts_json, payload, scheme, key_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        session.userId,
        input.clientRunId,
        JSON.stringify(name),
        input.createdAt,
        JSON.stringify(input.counts),
        JSON.stringify(payload),
        payload.scheme,
        payload.keyVersion,
      );
    return new Response(JSON.stringify({ id }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });

  app.get("/api/runs", async ({ request }) => {
    const session = await deps.getSession(request);
    if (!session) {
      return jsonError(401, "unauthorized");
    }
    const url = new URL(request.url);
    const since = Number(url.searchParams.get("since") ?? 0);
    const rows = deps.db
      .query(
        "SELECT * FROM sort_runs WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC",
      )
      .all(session.userId, Number.isFinite(since) ? since : 0) as RunRow[];
    return { runs: rows.map((row) => toMeta(deps, session.userId, row)) };
  });

  app.get("/api/runs/:id", async ({ request, params }) => {
    const session = await deps.getSession(request);
    if (!session) {
      return jsonError(401, "unauthorized");
    }
    const row = findRun(deps.db, params.id, session.userId);
    if (!row) {
      return jsonError(404, "not_found");
    }
    const key = getDataKey(deps.db, deps.config.masterKey, session.userId);
    const blob = JSON.parse(row.payload) as SealedBlob;
    const rows = JSON.parse(
      Buffer.from(open(key, blob, `${session.userId}|${row.id}|server-v1`)).toString("utf8"),
    ) as ReportRow[];
    return { ...toMeta(deps, session.userId, row), rows };
  });

  // Registered before /api/runs/:id so Elysia does not treat "client" as an id.
  app.delete("/api/runs/client/:clientRunId", async ({ request, params }) => {
    const session = await deps.getSession(request);
    if (!session) {
      return jsonError(401, "unauthorized");
    }
    const result = deps.db
      .query("DELETE FROM sort_runs WHERE client_run_id = ? AND user_id = ?")
      .run(params.clientRunId, session.userId);
    if (result.changes === 0) {
      return jsonError(404, "not_found");
    }
    return new Response(null, { status: 204 });
  });

  app.delete("/api/runs/:id", async ({ request, params }) => {
    const session = await deps.getSession(request);
    if (!session) {
      return jsonError(401, "unauthorized");
    }
    const result = deps.db
      .query("DELETE FROM sort_runs WHERE id = ? AND user_id = ?")
      .run(params.id, session.userId);
    if (result.changes === 0) {
      return jsonError(404, "not_found");
    }
    return new Response(null, { status: 204 });
  });
}
