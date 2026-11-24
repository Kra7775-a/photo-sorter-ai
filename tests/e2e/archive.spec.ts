import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const ZIP_FIXTURE = fileURLToPath(new URL("../fixtures/photos.zip", import.meta.url));

test.describe("archive sorting", () => {
  test.describe.configure({ mode: "serial" });

  test("sorts a ZIP and records one history run", async ({ page }) => {
    test.skip(test.info().project.name !== "chromium-desktop", "desktop project only");
    // First run downloads MobileCLIP (~145 MB) and the ONNX WASM runtime.
    test.setTimeout(300_000);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AI Photo Sorter" })).toBeVisible();

    const categories = page.getByRole("textbox", { name: /Categories/ });
    await expect(categories).toHaveValue(
      "people\nfood\nanimals\nnature\ndocuments\nscreenshots\ntransport",
    );

    await page.locator('input[accept=".zip,application/zip"]').setInputFiles(ZIP_FIXTURE);

    const downloadLink = page.getByRole("link", { name: "Download photos-sorted.zip" });
    await expect(downloadLink).toBeVisible({ timeout: 300_000 });
    await expect(page.getByText("sorted: 1 · skipped: 0 · errors: 0").first()).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("photos-sorted.zip");

    await expect(page.getByText("runs: 1", { exact: true })).toBeVisible();
  });
});
