import type { Database } from "bun:sqlite";

import { Elysia } from "elysia";

import type { Auth } from "./auth.ts";
import { createGetSession } from "./auth.ts";
import type { Config } from "./config.ts";
import { registerRunRoutes } from "./runs.ts";

export type AppDeps = { db: Database; config: Config; auth: Auth };

/** Builds the API app; deps are explicit so tests never need env secrets. */
export function createApp(deps: AppDeps): Elysia {
  const app: Elysia = new Elysia();
  // Route registration mutates the instance; keep the plain Elysia type so
  // later tasks can extend the app without fighting chained generic types.
  app.get("/api/health", () => ({ status: "ok" }));
  // Catch-all keeps the full URL so better-auth (basePath /api/auth) sees
  // the original request, including method, headers and body.
  app.all("/api/auth/*", ({ request }) => deps.auth.handler(request));
  registerRunRoutes(app, {
    db: deps.db,
    config: deps.config,
    getSession: createGetSession(deps.auth),
  });
  return app;
}
