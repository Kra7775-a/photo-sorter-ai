/// <reference lib="dom" />
import { describe, expect, test } from "bun:test";

import { setupComponentTest } from "./component-test";

const { render, screen, userEvent } = await setupComponentTest();

const { default: Switch } = await import("./Switch.svelte");

describe("Switch", () => {
  test("toggles and reports the checked state", async () => {
    const seen: boolean[] = [];
    render(Switch, { label: "Sync metadata", onchange: (next: boolean) => seen.push(next) });

    await userEvent.click(screen.getByRole("switch"));
    expect(seen).toEqual([true]);
  });
});
