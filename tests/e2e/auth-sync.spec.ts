import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test.describe("account and opt-in sync", () => {
  test("signs up, enables sync, then signs out", async ({ page }) => {
    const email = `e2e-${randomUUID()}@example.com`;

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AI Photo Sorter" })).toBeVisible();

    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("E2EPassword123!");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(email, { exact: true })).toBeVisible();
    const syncSwitch = page.getByRole("switch", { name: "Sync metadata" });
    await expect(syncSwitch).toBeVisible();

    const syncRequest = page.waitForRequest((request) =>
      /^\/api\/(runs|settings)(?:\/|\?|$)/.test(new URL(request.url()).pathname),
    );
    await syncSwitch.click();
    await syncRequest;

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(syncSwitch).toHaveCount(0);
  });
});
