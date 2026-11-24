import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const PHOTO_FIXTURE = fileURLToPath(new URL("../fixtures/photo.jpg", import.meta.url));
const MODEL_TIMEOUT = 300_000;

test.describe("individual photo flow", () => {
  test.describe.configure({ mode: "serial" });

  // One context for both model tests: the browser keeps the downloaded weights,
  // so the second classification starts warm instead of fetching them again.
  let warmPage: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    const settings = testInfo.project.use;
    const context = await browser.newContext({
      baseURL: settings.baseURL,
      viewport: settings.viewport,
      screen: settings.screen,
      deviceScaleFactor: settings.deviceScaleFactor,
      isMobile: settings.isMobile,
      hasTouch: settings.hasTouch,
      colorScheme: settings.colorScheme,
      userAgent: settings.userAgent,
      locale: settings.locale,
    });
    warmPage = await context.newPage();
  });

  test.afterAll(async () => {
    await warmPage.context().close();
  });

  test("a fresh page with sync off makes no /api requests", async ({ page }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) {
        apiRequests.push(request.url());
      }
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AI Photo Sorter" })).toBeVisible();
    await expect(page.getByText("no account", { exact: false })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Sync metadata" })).toHaveCount(0);

    expect(apiRequests).toEqual([]);
  });

  test("uploading one photo shows a list item with score chips", async () => {
    test.setTimeout(MODEL_TIMEOUT);

    await warmPage.goto("/");
    await warmPage.locator('input[accept="image/*"]').setInputFiles(PHOTO_FIXTURE);

    const item = warmPage.locator("ul li").filter({ hasText: "photo.jpg" });
    await expect(item).toBeVisible({ timeout: MODEL_TIMEOUT });
    await expect(item.locator("span").filter({ hasText: /· \d+%$/ })).toHaveCount(3);
    await expect(item.getByText(/\d+ ms/)).toBeVisible();
  });

  test("both file inputs stay disabled while a photo is processing", async () => {
    test.setTimeout(MODEL_TIMEOUT);

    await warmPage.goto("/");
    const photos = warmPage.locator('input[accept="image/*"]');
    const archive = warmPage.locator('input[accept=".zip,application/zip"]');
    await expect(photos).toBeEnabled();
    await expect(archive).toBeEnabled();

    await photos.setInputFiles(PHOTO_FIXTURE);

    await expect(photos).toBeDisabled();
    await expect(archive).toBeDisabled();
    await expect(warmPage.locator("ul li").filter({ hasText: "photo.jpg" })).toBeVisible({
      timeout: MODEL_TIMEOUT,
    });
    await expect(photos).toBeEnabled();
    await expect(archive).toBeEnabled();
  });
});
