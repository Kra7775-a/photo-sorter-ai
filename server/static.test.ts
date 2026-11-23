import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAuth } from "./auth.ts";
import type { Config } from "./config.ts";
import { migrate, openDb } from "./db.ts";
import { createApp } from "./index.ts";
import { generateMasterKey } from "./keys.ts";

const INDEX = "<html><body>photo sorter</body></html>";
const ASSET = "console.log('asset');";

let staticRoot: string;
let app: ReturnType<typeof createApp>;

function get(path: string): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`));
}

beforeAll(() => {
  staticRoot = mkdtempSync(join(tmpdir(), "photo-sorter-static-"));
  writeFileSync(join(staticRoot, "index.html"), INDEX);
  mkdirSync(join(staticRoot, "assets"));
  writeFileSync(join(staticRoot, "assets", "app.js"), ASSET);
  // A source-like file outside the static root must never be served.
  writeFileSync(join(tmpdir(), "photo-sorter-secret.txt"), "secret");

  const config: Config = {
    masterKey: new Uint8Array(32),
    authSecret: "test-secret-not-a-real-one",
    dbPath: ":memory:",
    port: 3001,
    baseUrl: "http://localhost:3001",
  };
  const db = openDb(":memory:");
  migrate(db);
  app = createApp({ db, config, auth: createAuth(db, config), staticRoot });
});

afterAll(() => {
  rmSync(staticRoot, { recursive: true, force: true });
  rmSync(join(tmpdir(), "photo-sorter-secret.txt"), { force: true });
});

describe("static app", () => {
  test("GET /api/health returns JSON status", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("unknown /api/* returns JSON 404 for every method", async () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const res = await app.handle(new Request("http://localhost/api/does-not-exist", { method }));
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toEqual({ error: "not_found" });
    }
  });

  test("GET / serves index.html", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe(INDEX);
  });

  test("GET /history falls back to index.html (SPA)", async () => {
    const res = await get("/history");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe(INDEX);
  });

  test("existing asset is served from the static root with an explicit content type", async () => {
    const res = await get("/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(await res.text()).toBe(ASSET);
  });

  test("path traversal and source-like paths fall back to index.html", async () => {
    for (const path of [
      "/../photo-sorter-secret.txt",
      "/%2e%2e%2fphoto-sorter-secret.txt",
      "/index.ts",
      "/server/config.ts",
    ]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(INDEX);
    }
  });
});

describe("generateMasterKey", () => {
  test("returns distinct canonical base64 keys of 32 bytes", () => {
    const first = generateMasterKey();
    const second = generateMasterKey();
    expect(first).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(Buffer.from(first, "base64")).toHaveLength(32);
    expect(first).not.toBe(second);
  });
});
