/// <reference lib="dom" />
import { describe, expect, test } from "bun:test";

import { setupComponentTest } from "./component-test";

const { render, screen } = await setupComponentTest();

const { default: TextField } = await import("./TextField.svelte");

describe("TextField", () => {
  test("shows label, hint, error and invalid state", () => {
    render(TextField, { label: "Email", hint: "Work address", error: "Required" });

    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Work address")).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
  });
});
