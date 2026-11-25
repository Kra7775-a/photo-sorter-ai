/// <reference lib="dom" />
import { describe, expect, mock, test } from "bun:test";

import { setupComponentTest } from "../ui/component-test";

const { render, screen, userEvent } = await setupComponentTest();

const { default: AuthForm } = await import("./AuthForm.svelte");

function submitButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('form button[type="submit"]');

  if (button === null) {
    throw new Error("No submit button rendered");
  }
  return button;
}

function authCallbacks() {
  return {
    onSignIn: mock(async (_email: string, _password: string) => {}),
    onSignUp: mock(async (_email: string, _password: string) => {}),
  };
}

describe("AuthForm", () => {
  test("submits sign-in with the typed email and password", async () => {
    const { onSignIn, onSignUp } = authCallbacks();
    render(AuthForm, { busy: false, error: null, onSignIn, onSignUp });

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(submitButton());

    expect(onSignIn).toHaveBeenCalledWith("user@example.com", "secret");
    expect(onSignUp).not.toHaveBeenCalled();
  });

  test("sign-up mode changes the submit label and submits onSignUp", async () => {
    const { onSignIn, onSignUp } = authCallbacks();
    render(AuthForm, { busy: false, error: null, onSignIn, onSignUp });

    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(submitButton().textContent.trim()).toBe("Create account");

    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(submitButton());

    expect(onSignUp).toHaveBeenCalledWith("new@example.com", "secret");
    expect(onSignIn).not.toHaveBeenCalled();
  });

  test("disables the submit button while busy", () => {
    const { onSignIn, onSignUp } = authCallbacks();
    render(AuthForm, { busy: true, error: null, onSignIn, onSignUp });

    expect(submitButton().disabled).toBe(true);
  });
});
