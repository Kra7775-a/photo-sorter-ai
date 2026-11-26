import type { Counts } from "#shared/counts";

import type { SyncRun, SyncSettings } from "./types";

export type SyncClient = {
  pushRun(run: SyncRun): Promise<string>;
  pullRuns(since: number): Promise<SyncRun[]>;
  getRun(serverId: string): Promise<SyncRun>;
  deleteRun(serverId: string): Promise<void>;
  deleteRunByClientId(clientRunId: string): Promise<void>;
  pushSettings(settings: SyncSettings): Promise<SyncSettings>;
  pullSettings(): Promise<SyncSettings | null>;
};

export class SyncError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SyncError";
  }
}

export class NetworkError extends SyncError {
  constructor(cause: unknown) {
    super("network request failed", { cause });
    this.name = "NetworkError";
  }
}

export class HttpError extends SyncError {
  readonly status: number;

  constructor(status: number) {
    super(`request failed with status ${status}`);
    this.name = "HttpError";
    this.status = status;
  }
}

export class UnauthorizedError extends HttpError {
  constructor() {
    super(401);
    this.name = "UnauthorizedError";
  }
}

export class QuotaError extends HttpError {
  constructor() {
    super(413);
    this.name = "QuotaError";
  }
}

type ServerRunMeta = {
  id: string;
  clientRunId: string;
  sourceName: string;
  createdAt: number;
  counts: Counts;
};

type ServerSettings = {
  payload: { labels: string[] };
  updatedAt: number;
};

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 50;

function isRetriable(error: unknown): boolean {
  return error instanceof NetworkError || (error instanceof HttpError && error.status >= 500);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withRetry<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isRetriable(error)) {
        throw error;
      }
      await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

function toSyncRun(meta: ServerRunMeta, rows: SyncRun["rows"] = []): SyncRun {
  return {
    clientRunId: meta.clientRunId,
    sourceName: meta.sourceName,
    createdAt: meta.createdAt,
    counts: meta.counts,
    rows,
    serverId: meta.id,
  };
}

function toSyncSettings(value: ServerSettings): SyncSettings {
  return { labels: value.payload.labels, updatedAt: value.updatedAt };
}

/** Fetch wrapper for the sync API: only network failures and 5xx are retried. */
export function createSyncClient(opts: { baseUrl: string; fetchImpl?: typeof fetch }): SyncClient {
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await withRetry(async () => {
      const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
      let result: Response;
      try {
        result = await fetchImpl(`${baseUrl}${path}`, init);
      } catch (error) {
        throw new NetworkError(error);
      }
      if (!result.ok) {
        if (result.status === 401) {
          throw new UnauthorizedError();
        }
        if (result.status === 413) {
          throw new QuotaError();
        }
        throw new HttpError(result.status);
      }
      return result;
    });
    const text = await response.text();
    return (text === "" ? null : JSON.parse(text)) as T;
  }

  return {
    async pushRun(run) {
      const { clientRunId, sourceName, createdAt, counts, rows } = run;
      const result = await request<{ id: string }>("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientRunId, sourceName, createdAt, counts, rows }),
      });
      return result.id;
    },

    async pullRuns(since) {
      const result = await request<{ runs: ServerRunMeta[] }>(
        `/api/runs?since=${encodeURIComponent(String(since))}`,
      );
      return result.runs.map((meta) => toSyncRun(meta));
    },

    async getRun(serverId) {
      const meta = await request<ServerRunMeta & { rows: SyncRun["rows"] }>(
        `/api/runs/${encodeURIComponent(serverId)}`,
      );
      return toSyncRun(meta, meta.rows);
    },

    async deleteRun(serverId) {
      await request<void>(`/api/runs/${encodeURIComponent(serverId)}`, { method: "DELETE" });
    },

    async deleteRunByClientId(clientRunId) {
      await request<void>(`/api/runs/client/${encodeURIComponent(clientRunId)}`, {
        method: "DELETE",
      });
    },

    async pushSettings(settings) {
      const result = await request<ServerSettings>("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payload: { labels: settings.labels },
          updatedAt: settings.updatedAt,
        }),
      });
      return toSyncSettings(result);
    },

    async pullSettings() {
      const result = await request<ServerSettings | null>("/api/settings");
      return result === null ? null : toSyncSettings(result);
    },
  };
}
