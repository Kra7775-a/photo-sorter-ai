/// <reference lib="dom" />
import { describe, expect, test } from "bun:test";

import { setupComponentTest } from "./component-test";

const { render, screen, userEvent, createRawSnippet } = await setupComponentTest();

const { default: Button } = await import("./Button.svelte");

const children = () => createRawSnippet(() => ({ render: () => "<span>Save</span>" }));

describe("Button", () => {
  test("renders a button and forwards clicks", async () => {
    let clicked = 0;
    render(Button, { children: children(), onclick: () => (clicked += 1) });

    await userEvent.click(screen.getByRole("button"));
    expect(clicked).toBe(1);
  });

  test("with href renders a download link", () => {
    render(Button, { href: "/report.csv", download: "report.csv", children: children() });

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/report.csv");
    expect(link.getAttribute("download")).toBe("report.csv");
  });
});
