/// <reference lib="dom" />
import { describe, expect, test } from "bun:test";

import { setupComponentTest } from "./component-test";

const { render, screen, userEvent } = await setupComponentTest();

const { default: Textarea } = await import("./Textarea.svelte");

describe("Textarea", () => {
  test("shows hint/error and reports input and change values", async () => {
    const inputSeen: string[] = [];
    const changeSeen: string[] = [];
    render(Textarea, {
      label: "Categories",
      hint: "One per line",
      error: "Required",
      oninput: (value: string) => inputSeen.push(value),
      onchange: (value: string) => changeSeen.push(value),
    });

    const input = screen.getByLabelText("Categories");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("One per line")).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();

    await userEvent.type(input, "cat{enter}");
    expect(inputSeen.join("")).toContain("cat");
    await userEvent.tab();
    expect(changeSeen.join("")).toContain("cat");
  });
});
