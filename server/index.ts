import type { Database } from "bun:sqlite";

import { Elysia } from "elysia";

import type { Config } from "./config.ts";

/** Builds the API app; deps are explicit so tests never need env secrets. */
export function createApp(_deps: { db: Database; config: Config }): Elysia {
  const app: Elysia = new Elysia();
  // Route registration mutates the instance; keep the plain Elysia type so
  // later tasks can extend the app without fighting chained generic types.
  app.get("/api/health", () => ({ status: "ok" }));
  return app;
}
