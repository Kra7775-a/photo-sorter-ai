/**
 * Measures ZIP sorting in a real Chromium session and writes a JSON report.
 * Guest sorting makes no `/api` calls, so only Vite is started when needed.
 */
import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { chromium } from "@playwright/test";

const DEFAULT_ZIP = "/home/kramarich/Загрузки/val.zip";
const LOCAL_ORIGIN = "http://localhost:3000";
const PROBE_TIMEOUT_MS = 2000;
const STARTUP_TIMEOUT_MS = 60_000;
const RESULT_TIMEOUT_MS = Number(process.env.BENCH_RESULT_TIMEOUT_MS ?? 30 * 60_000);

type BenchReport = {
  timestamp: string;
  zipPath: string;
  zipBytes: number;
  batchSize: string | number;
  elapsedMs: number;
  countsText: string;
  consoleErrors: string[];
  chromiumVersion: string;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Returns the HTTP status, or null when nothing answers at the origin. */
async function probe(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    await response.body?.cancel();
    return response.status;
  } catch {
    return null;
  }
}

async function waitForServer(origin: string, child: ReturnType<typeof Bun.spawn>): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if ((await probe(`${origin}/`)) === 200) {
      return;
    }
    if (child.exitCode !== null) {
      break;
    }
    await Bun.sleep(250);
  }

  throw new Error(`Vite did not answer 200 on ${origin} within 60s`);
}

async function stopServer(child: ReturnType<typeof Bun.spawn>): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  const stopped = await Promise.race([
    child.exited.then(() => true),
    Bun.sleep(5000).then(() => false),
  ]);

  if (!stopped) {
    child.kill("SIGKILL");
    await child.exited;
  }
}

async function main(): Promise<void> {
  const zipPath = resolve(process.argv[2] ?? DEFAULT_ZIP);
  const file = await stat(zipPath).catch(() => null);

  if (file?.isFile() !== true) {
    throw new Error(`ZIP not found: ${zipPath}`);
  }

  const batchSize = process.env.VITE_BATCH_SIZE ?? 8;
  const baseURL = (process.env.BENCH_BASE_URL ?? LOCAL_ORIGIN).replace(/\/+$/, "");
  let server: ReturnType<typeof Bun.spawn> | null = null;

  try {
    if (process.env.BENCH_BASE_URL === undefined) {
      if ((await probe(`${baseURL}/`)) !== null) {
        throw new Error(
          `Port 3000 is already in use. Free port 3000 or set BENCH_BASE_URL to reuse a running app.`,
        );
      }

      server = Bun.spawn(["bun", "vite"], {
        cwd: process.cwd(),
        stdout: "inherit",
        stderr: "inherit",
      });
      await waitForServer(baseURL, server);
    }

    const browser = await chromium.launch();

    try {
      const context = await browser.newContext({ baseURL, acceptDownloads: true });
      const page = await context.newPage();
      const consoleErrors: string[] = [];

      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });
      page.on("pageerror", (error) => {
        consoleErrors.push(error.message);
      });
      page.on("crash", () => {
        consoleErrors.push("page crashed");
      });

      await page.goto("/app");

      const upload = page.locator('input[accept=".zip,application/zip"]');
      const resultLink = page
        .locator("a[download]")
        .or(page.getByRole("link", { name: /^Download / }))
        .first();

      const startedAt = performance.now();
      await upload.setInputFiles(zipPath);
      const deadline = Date.now() + RESULT_TIMEOUT_MS;
      let lastLog = 0;
      let visible = false;

      while (Date.now() < deadline) {
        if (await resultLink.isVisible()) {
          visible = true;
          break;
        }
        if (Date.now() - lastLog >= 30_000) {
          const uiText = await page
            .locator("main")
            .innerText()
            .catch(() => "(no main text)");
          console.info(`bench:sort still running… ${uiText.replaceAll("\n", " | ").slice(0, 300)}`);
          lastLog = Date.now();
        }
        await Bun.sleep(2000);
      }

      if (!visible) {
        const uiText = await page
          .locator("main")
          .innerText()
          .catch(() => "(no main text)");
        throw new Error(
          `Result link did not appear within ${RESULT_TIMEOUT_MS}ms\nUI: ${uiText.slice(0, 2000)}\nConsole errors: ${consoleErrors.join(" | ").slice(0, 2000)}`,
        );
      }
      const elapsedMs = Math.round(performance.now() - startedAt);

      const countsText = await page
        .locator("main")
        .getByText(/sorted: \d+ · skipped: \d+ · errors: \d+/)
        .first()
        .innerText({ timeout: 10_000 });

      const report: BenchReport = {
        timestamp: new Date().toISOString(),
        zipPath,
        zipBytes: file.size,
        batchSize,
        elapsedMs,
        countsText,
        consoleErrors,
        chromiumVersion: browser.version(),
      };

      const stamp = report.timestamp.replaceAll(":", "-").replaceAll(".", "-");
      const reportPath = `reports/bench/sort-${stamp}.json`;

      await mkdir(dirname(reportPath), { recursive: true });
      await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);

      console.info(
        `bench:sort ${(elapsedMs / 1000).toFixed(1)}s · ${countsText} · ${consoleErrors.length} console errors · batch ${batchSize} → ${reportPath}`,
      );
    } finally {
      await browser.close();
    }
  } finally {
    if (server !== null) {
      await stopServer(server);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(`bench:sort failed: ${messageOf(error)}`);
  process.exitCode = 1;
}
