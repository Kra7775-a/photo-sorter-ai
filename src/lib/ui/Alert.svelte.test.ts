/// <reference lib="dom" />
import { describe, expect, test } from "bun:test";

import { setupComponentTest } from "./component-test";

const { render, screen, createRawSnippet } = await setupComponentTest();

const { default: Alert } = await import("./Alert.svelte");

describe("Alert", () => {
  test("exposes its role and tone", () => {
    render(Alert, {
      tone: "danger",
      role: "alert",
      children: createRawSnippet(() => ({ render: () => "<span>failed</span>" })),
    });

    expect(screen.getByRole("alert").className).toContain("bg-danger-soft");
    expect(screen.getByText("failed")).toBeTruthy();
  });
});
