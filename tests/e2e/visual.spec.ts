import { expect, test } from "@playwright/test";

const SCREENSHOT_OPTIONS = { animations: "disabled" as const, maxDiffPixelRatio: 0.02 };

test.describe("empty state visuals", () => {
  test("dark desktop", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AI Photo Sorter" })).toBeVisible();

    await expect(page.locator("main")).toHaveScreenshot(
      "empty-dark-desktop.png",
      SCREENSHOT_OPTIONS,
    );
  });

  test("light desktop", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AI Photo Sorter" })).toBeVisible();

    await expect(page.locator("main")).toHaveScreenshot(
      "empty-light-desktop.png",
      SCREENSHOT_OPTIONS,
    );
  });

  test("dark mobile", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AI Photo Sorter" })).toBeVisible();

    await expect(page.locator("main")).toHaveScreenshot(
      "empty-dark-mobile.png",
      SCREENSHOT_OPTIONS,
    );
  });
});
