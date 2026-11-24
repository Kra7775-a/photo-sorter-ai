/// <reference lib="dom" />
import { describe, expect, test } from "bun:test";

import { setupComponentTest } from "./component-test";

const { render, screen, createRawSnippet } = await setupComponentTest();

const { default: Badge } = await import("./Badge.svelte");

describe("Badge", () => {
  test("renders children with the requested tone", () => {
    render(Badge, {
      tone: "accent",
      children: createRawSnippet(() => ({ render: () => "<span>label</span>" })),
    });

    expect(screen.getByText("label")).toBeTruthy();
    expect(document.querySelector("span")?.className).toContain("bg-accent-soft");
  });
});
