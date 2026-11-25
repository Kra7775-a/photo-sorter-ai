import { expect, test } from "@playwright/test";

const SCREENSHOT_OPTIONS = { animations: "disabled" as const, maxDiffPixelRatio: 0.02 };

const variants = [
  { label: "dark desktop", colorScheme: "dark" as const },
  { label: "light desktop", colorScheme: "light" as const },
  { label: "dark mobile", colorScheme: "dark" as const },
];

// The sorter lives at /app now; these three variants keep the original empty
// state baselines (same file names) but capture the app shell's main element.
test.describe("empty state visuals", () => {
  for (const variant of variants) {
    test(variant.label, async ({ page }) => {
      await page.emulateMedia({ colorScheme: variant.colorScheme });
      await page.goto("/app");
      await expect(page.getByRole("link", { name: "AI Photo Sorter" })).toBeVisible();

      await expect(page.locator("main")).toHaveScreenshot(
        `empty-${variant.label.replace(" ", "-")}.png`,
        SCREENSHOT_OPTIONS,
      );
    });
  }
});

// The new public landing page gets its own baselines so its layout is tracked too.
test.describe("landing page visuals", () => {
  for (const variant of variants) {
    test(variant.label, async ({ page }) => {
      await page.emulateMedia({ colorScheme: variant.colorScheme });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Photos stay on your device" })).toBeVisible();

      await expect(page.locator("main")).toHaveScreenshot(
        `landing-${variant.label.replace(" ", "-")}.png`,
        SCREENSHOT_OPTIONS,
      );
    });
  }
});
