import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";

const ZIP_FIXTURE = fileURLToPath(new URL("../fixtures/photos.zip", import.meta.url));

test.describe("archive sorting", () => {
  test.describe.configure({ mode: "serial" });

  test("sorts a ZIP, records a run and keeps it visible across navigation", async ({ page }) => {
    test.skip(test.info().project.name !== "chromium-desktop", "desktop project only");
    // First run downloads MobileCLIP (~145 MB) and the ONNX WASM runtime.
    test.setTimeout(360_000);

    await page.goto("/app");
    await expect(page.getByRole("link", { name: "AI Photo Sorter" })).toBeVisible();

    const categories = page.getByRole("textbox", { name: /Categories/ });
    await expect(categories).toHaveValue(
      "people\nfood\nanimals\nnature\ndocuments\nscreenshots\ntransport",
    );

    await page.locator('input[accept=".zip,application/zip"]').setInputFiles(ZIP_FIXTURE);

    const downloadLink = page.getByRole("link", { name: "Download photos-sorted.zip" });
    await expect(downloadLink).toBeVisible({ timeout: 300_000 });
    // The fixture photo is uncertain under the new thresholds, so it lands in review/.
    await expect(
      page.getByText("sorted: 0 · skipped: 0 · errors: 0 · review: 1").first(),
    ).toBeVisible();
    await expect(page.getByText("1 file needs manual review in review/.").first()).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("photos-sorted.zip");

    // Read the downloaded archive in Node to pin the report.csv contract.
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(await readFile(downloadPath))));
    try {
      const entries = await zip.getEntries();
      const report = entries.find((entry) => entry.filename === "report.csv");
      expect(report).toBeDefined();
      const csv = Buffer.from(await report!.getData(new Uint8ArrayWriter())).toString("utf8");
      expect(csv.split("\r\n")[0]).toBe(
        "\uFEFFsource,category,score,margin,candidate,runner_up,status,error",
      );
    } finally {
      await zip.close();
    }

    await expect(page.getByText("runs: 1", { exact: true })).toBeVisible();

    // Sign in from the app shell, then leave /app and come back: the single
    // AppController in the root layout must keep the recorded local run.
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await page.getByLabel("Email").fill(`e2e-${randomUUID()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("E2EPassword123!");
    await page.locator("form").getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
    await expect(page.getByText("runs: 1", { exact: true })).toBeVisible();

    await page
      .getByRole("navigation", { name: "App navigation" })
      .getByRole("link", { name: "Help" })
      .click();
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();

    await page.getByRole("link", { name: "Try free" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText("runs: 1", { exact: true })).toBeVisible();
  });
});
