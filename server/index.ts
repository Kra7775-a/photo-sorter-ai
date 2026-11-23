import type { Database } from "bun:sqlite";
import { extname, resolve, sep } from "node:path";

import { Elysia } from "elysia";

import type { Auth } from "./auth.ts";
import { createGetSession } from "./auth.ts";
import type { Config } from "./config.ts";
import { registerRunRoutes } from "./runs.ts";
import { registerSettingsRoutes } from "./settings.ts";

export type AppDeps = {
  db: Database;
  config: Config;
  auth: Auth;
  /** Directory with the built SPA; injectable so tests can use a fixture. */
  staticRoot?: string;
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Resolves a URL path inside staticRoot, or null if it escapes the root. */
function resolveStaticPath(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) {
    return null;
  }
  const segments = decoded.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === "." || s === "..")) {
    return null;
  }
  // server/ and hidden files never belong to the built SPA.
  if (segments[0] === "server" || segments.some((s) => s.startsWith("."))) {
    return null;
  }
  const base = resolve(root);
  const target = resolve(base, ...segments);
  return target.startsWith(base + sep) ? target : null;
}

async function serveStatic(root: string, pathname: string): Promise<Response> {
  const target = resolveStaticPath(root, pathname);
  if (target) {
    const file = Bun.file(target);
    if (await file.exists()) {
      return new Response(file, {
        headers: {
          "content-type":
            CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
        },
      });
    }
  }
  return new Response(Bun.file(resolve(root, "index.html")), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** Builds the API app; deps are explicit so tests never need env secrets. */
export function createApp(deps: AppDeps): Elysia {
  const app: Elysia = new Elysia();
  // Route registration mutates the instance; keep the plain Elysia type so
  // later tasks can extend the app without fighting chained generic types.
  app.get("/api/health", () => ({ status: "ok" }));
  // Catch-all keeps the full URL so better-auth (basePath /api/auth) sees
  // the original request, including method, headers and body.
  app.all("/api/auth/*", ({ request }) => deps.auth.handler(request));
  const getSession = createGetSession(deps.auth);
  registerRunRoutes(app, { db: deps.db, config: deps.config, getSession });
  registerSettingsRoutes(app, { db: deps.db, config: deps.config, getSession });
  // Both fallbacks are ALL-verb wildcards: a GET-only "/*" would outrank the
  // ALL-verb /api/auth/* route and break better-auth in Elysia 2.
  app.all("/api/*", () => jsonError(404, "not_found"));
  app.all("/*", async ({ path, request }) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError(404, "not_found");
    }
    return serveStatic(deps.staticRoot ?? "dist", path);
  });
  return app;
}
