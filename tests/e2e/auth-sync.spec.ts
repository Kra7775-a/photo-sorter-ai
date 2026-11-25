import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "E2EPassword123!";

async function signUp(page: Page, email: string): Promise<void> {
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function submitSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
}

test.describe("account and opt-in sync", () => {
  test("signs up, enables sync, then signs out", async ({ page }) => {
    const email = `e2e-${randomUUID()}@example.com`;

    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await signUp(page, email);
    await expect(page.getByRole("button", { name: "Account" })).toBeVisible();

    // Sync controls and sign out live inside the account dialog, not on /app.
    await page.getByRole("button", { name: "Account" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();

    const syncSwitch = page.getByRole("switch", { name: "Sync metadata" });
    await expect(syncSwitch).toBeVisible();

    const syncRequest = page.waitForRequest((request) =>
      /^\/api\/(runs|settings)(?:\/|\?|$)/.test(new URL(request.url()).pathname),
    );
    await syncSwitch.click();
    await syncRequest;

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(syncSwitch).toHaveCount(0);
    // The Email field only exists on the dedicated sign-in page now.
    await expect(page.getByLabel("Email")).toHaveCount(0);
    const cookiesAfterSignOut = await page.context().cookies();
    expect(cookiesAfterSignOut.some((cookie) => cookie.name === "photo-sorter-session")).toBe(
      false,
    );

    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("an existing session on /sign-in redirects to /app", async ({ page }) => {
    const email = `e2e-${randomUUID()}@example.com`;

    await page.goto("/sign-in");
    await signUp(page, email);
    await expect(page.getByRole("button", { name: "Account" })).toBeVisible();

    // Sign-up creates a session and the readable hint cookie; no fabricated
    // cookie is needed for the returning-user redirect.
    const cookies = await page.context().cookies();
    const hint = cookies.find((cookie) => cookie.name === "photo-sorter-session");
    expect(hint?.value).toBe("1");

    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  });

  test("a failed sign-in stays on /sign-in with a visible error", async ({ page }) => {
    await page.goto("/sign-in");
    await submitSignIn(page, `missing-${randomUUID()}@example.com`, "WrongPassword123!");

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    const error = page.getByRole("alert");
    await expect(error).toBeVisible();
    await expect(error).not.toBeEmpty();
  });
});
