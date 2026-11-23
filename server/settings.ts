import type { Database } from "bun:sqlite";

import type { Elysia } from "elysia";

import type { GetSession } from "./auth.ts";
import type { Config } from "./config.ts";
import { open, seal, type SealedBlob } from "./crypto.ts";
import { getDataKey } from "./keys.ts";

export type SettingsPayload = { labels: string[] };
export type SettingsValue = { payload: SettingsPayload; updatedAt: number };
export type SettingsDeps = { db: Database; config: Config; getSession: GetSession };

type SettingsRow = {
  user_id: string;
  payload: string;
  scheme: string;
  key_version: number;
  updated_at: number;
};

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function dataAad(userId: string): string {
  return `${userId}|settings|server-v1`;
}

function validBody(value: unknown): value is SettingsValue {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const body = value as Record<string, unknown>;
  if (typeof body.updatedAt !== "number") {
    return false;
  }
  const payload = body.payload as Record<string, unknown> | undefined;
  return (
    !!payload && Array.isArray(payload.labels) && payload.labels.every((l) => typeof l === "string")
  );
}

function findSettings(db: Database, userId: string): SettingsRow | undefined {
  return db.query("SELECT * FROM settings WHERE user_id = ?").get(userId) as
    | SettingsRow
    | undefined;
}

function readSettings(deps: SettingsDeps, userId: string): SettingsValue | null {
  const row = findSettings(deps.db, userId);
  if (!row) {
    return null;
  }
  const key = getDataKey(deps.db, deps.config.masterKey, userId);
  const blob = JSON.parse(row.payload) as SealedBlob;
  const json = Buffer.from(open(key, blob, dataAad(userId))).toString("utf8");
  return { payload: JSON.parse(json) as SettingsPayload, updatedAt: row.updated_at };
}

/** Registers encrypted, per-user settings endpoints on an Elysia app. */
export function registerSettingsRoutes(app: Elysia, deps: SettingsDeps): void {
  app.get("/api/settings", async ({ request }) => {
    const session = await deps.getSession(request);
    if (!session) {
      return jsonError(401, "unauthorized");
    }
    const value = readSettings(deps, session.userId);
    if (value === null) {
      // Elysia serializes a returned null as an empty body, so make it JSON null.
      return new Response("null", { headers: { "content-type": "application/json" } });
    }
    return value;
  });

  app.put("/api/settings", async ({ request }) => {
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

    const existing = findSettings(deps.db, session.userId);
    // Only strictly newer data replaces the stored value; ties keep the existing row.
    if (existing && input.updatedAt <= existing.updated_at) {
      return readSettings(deps, session.userId);
    }

    const key = getDataKey(deps.db, deps.config.masterKey, session.userId);
    const blob = seal(
      key,
      Buffer.from(JSON.stringify(input.payload), "utf8"),
      dataAad(session.userId),
    );
    deps.db
      .query(
        `INSERT INTO settings (user_id, payload, scheme, key_version, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           payload = excluded.payload,
           scheme = excluded.scheme,
           key_version = excluded.key_version,
           updated_at = excluded.updated_at`,
      )
      .run(session.userId, JSON.stringify(blob), blob.scheme, blob.keyVersion, input.updatedAt);
    return readSettings(deps, session.userId);
  });
}
