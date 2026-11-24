/// <reference lib="dom" />
import { describe, expect, test } from "bun:test";

import { setupComponentTest } from "./component-test";

const { render } = await setupComponentTest();

const { default: Icon } = await import("./Icon.svelte");

describe("Icon", () => {
  test("renders a decorative SVG", () => {
    const { container } = render(Icon, { name: "download" });
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
  });

  test("forwards the class to the SVG", () => {
    const { container } = render(Icon, { name: "download", class: "text-ink-muted" });

    expect(container.querySelector("svg")?.classList.contains("text-ink-muted")).toBe(true);
  });

  test("renders different path data for different names", () => {
    const brand = render(Icon, { name: "brand" });
    const brandPath = brand.container.querySelector("svg path")?.getAttribute("d");
    const signOut = render(Icon, { name: "signOut" });
    const signOutPath = signOut.container.querySelector("svg path")?.getAttribute("d");

    expect(brandPath).toBeTruthy();
    expect(signOutPath).toBeTruthy();
    expect(brandPath).not.toBe(signOutPath);
  });
});
