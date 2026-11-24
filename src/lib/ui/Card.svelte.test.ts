/// <reference lib="dom" />
import { describe, expect, test } from "bun:test";

import { setupComponentTest } from "./component-test";

const { render, screen, createRawSnippet } = await setupComponentTest();

const { default: Card } = await import("./Card.svelte");

describe("Card", () => {
  test("renders arbitrary content", () => {
    render(Card, {
      padding: "sm",
      children: createRawSnippet(() => ({ render: () => "<p>panel body</p>" })),
    });

    expect(screen.getByText("panel body")).toBeTruthy();
  });
});
