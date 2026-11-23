import { afterEach, describe, expect, mock, type Mock, spyOn, test } from "bun:test";

import type { ReportRow } from "../archive/naming";
import { createSyncClient, HttpError, NetworkError, QuotaError, UnauthorizedError } from "./client";
import type { SyncRun, SyncSettings } from "./types";

const BASE_URL = "https://sync.example.test";

const run: SyncRun = {
  clientRunId: "client-1",
  sourceName: "holiday.zip",
  createdAt: 1_700_000_000_000,
  counts: { sorted: 1, skipped: 2, errors: 3 },
  rows: [
    {
      source: "holiday/beach.jpg",
      category: "beach",
      score: 0.8,
      status: "sorted",
      error: "",
    } satisfies ReportRow,
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Bun types global `fetch` with extra helpers; tests only need the callable part. */
function fetchSpy(): Mock<FetchFn> {
  return spyOn(globalThis, "fetch");
}

/** Bun types `.rejects` as synchronous, so capture rejections explicitly. */
async function rejected(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("Expected the promise to reject");
}

afterEach(() => {
  mock.restore();
});

describe("createSyncClient", () => {
  test("retries a 500 and pushes the run once the server accepts it", async () => {
    const fetchMock = fetchSpy();
    fetchMock
      .mockImplementationOnce(async () => json({ error: "server_error" }, 500))
      .mockImplementationOnce(async () => json({ id: "srv-1" }, 201));
    const client = createSyncClient({ baseUrl: BASE_URL });

    expect(await client.pushRun(run)).toBe("srv-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/api/runs`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      clientRunId: run.clientRunId,
      sourceName: run.sourceName,
      createdAt: run.createdAt,
      counts: run.counts,
      rows: run.rows,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    );
  });

  test("throws UnauthorizedError on 401 without retrying", async () => {
    const fetchMock = fetchSpy();
    fetchMock.mockImplementation(async () => json({ error: "unauthorized" }, 401));
    const client = createSyncClient({ baseUrl: BASE_URL });

    expect(await rejected(client.pullRuns(0))).toBeInstanceOf(UnauthorizedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("throws QuotaError on 413 without retrying", async () => {
    const fetchMock = fetchSpy();
    fetchMock.mockImplementation(async () => json({ error: "quota" }, 413));
    const client = createSyncClient({ baseUrl: BASE_URL });

    expect(await rejected(client.pushRun(run))).toBeInstanceOf(QuotaError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("throws a typed error for other 4xx statuses without retrying", async () => {
    const fetchMock = fetchSpy();
    fetchMock.mockImplementation(async () => json({ error: "not_found" }, 404));
    const client = createSyncClient({ baseUrl: BASE_URL });

    const failure = await rejected(client.deleteRun("missing"));
    expect(failure).toBeInstanceOf(HttpError);
    expect((failure as HttpError).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("throws NetworkError after exactly three failed attempts", async () => {
    const fetchMock = fetchSpy();
    fetchMock.mockImplementation(async () => {
      throw new Error("offline");
    });
    const client = createSyncClient({ baseUrl: BASE_URL });

    const failure = await rejected(client.pullSettings());
    expect(failure).toBeInstanceOf(NetworkError);
    expect((failure as Error).cause).toEqual(new Error("offline"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("retries network errors and succeeds on the second attempt", async () => {
    const fetchMock = fetchSpy();
    fetchMock
      .mockImplementationOnce(async () => {
        throw new Error("offline");
      })
      .mockImplementationOnce(async () => json({ runs: [] }));
    const client = createSyncClient({ baseUrl: BASE_URL });

    expect(await client.pullRuns(0)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("maps server run metadata to the SyncRun shape", async () => {
    const fetchMock = fetchSpy();
    fetchMock.mockImplementation(async () =>
      json({
        runs: [
          {
            id: "srv-42",
            clientRunId: "client-42",
            sourceName: "trip.zip",
            createdAt: 1_700_000_000_000,
            counts: { sorted: 4, skipped: 1, errors: 0 },
          },
        ],
      }),
    );
    const client = createSyncClient({ baseUrl: `${BASE_URL}/` });

    expect(await client.pullRuns(123)).toEqual([
      {
        clientRunId: "client-42",
        sourceName: "trip.zip",
        createdAt: 1_700_000_000_000,
        counts: { sorted: 4, skipped: 1, errors: 0 },
        rows: [],
        serverId: "srv-42",
      },
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/api/runs?since=123`);
  });

  test("loads a single run with its report rows", async () => {
    const fetchMock = fetchSpy();
    fetchMock.mockImplementation(async () => json({ ...run, id: "srv-1" }));
    const client = createSyncClient({ baseUrl: BASE_URL });

    expect(await client.getRun("srv-1")).toEqual({ ...run, serverId: "srv-1" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/api/runs/srv-1`);
  });

  test("deletes a run and accepts an empty 204 response", async () => {
    const fetchMock = fetchSpy();
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    const client = createSyncClient({ baseUrl: BASE_URL });

    expect(await client.deleteRun("srv 1")).toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/api/runs/srv%201`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  test("maps null settings to null", async () => {
    const fetchMock = fetchSpy();
    fetchMock.mockImplementation(async () => new Response("null", { status: 200 }));
    const client = createSyncClient({ baseUrl: BASE_URL });

    expect(await client.pullSettings()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("maps server settings to the SyncSettings shape", async () => {
    const fetchMock = fetchSpy();
    fetchMock.mockImplementation(async () =>
      json({ payload: { labels: ["cats", "dogs"] }, updatedAt: 500 }),
    );
    const client = createSyncClient({ baseUrl: BASE_URL });

    expect(await client.pullSettings()).toEqual({
      labels: ["cats", "dogs"],
      updatedAt: 500,
    });
  });

  test("pushes settings in the server envelope and maps the response back", async () => {
    const fetchMock = fetchSpy();
    fetchMock.mockImplementation(async () =>
      json({ payload: { labels: ["cats"] }, updatedAt: 900 }),
    );
    const client = createSyncClient({ baseUrl: BASE_URL });
    const settings: SyncSettings = { labels: ["cats"], updatedAt: 900 };

    expect(await client.pushSettings(settings)).toEqual(settings);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/api/settings`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      payload: { labels: ["cats"] },
      updatedAt: 900,
    });
  });

  test("uses the injected fetch implementation instead of the global one", async () => {
    const fetchMock = mock(
      async () => new Response("null", { headers: { "content-type": "application/json" } }),
    );
    const globalMock = fetchSpy();
    const client = createSyncClient({
      baseUrl: BASE_URL,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(await client.pullSettings()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(globalMock).not.toHaveBeenCalled();
  });
});
