/// <reference lib="dom" />
import { afterAll } from "bun:test";

import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Shared setup for component tests. Each test file gets its own isolated DOM,
 * so server and archive tests keep Node globals.
 */
export async function setupComponentTest() {
  GlobalRegistrator.register();
  afterAll(() => {
    void GlobalRegistrator.unregister();
  });

  const [{ render, screen }, { default: userEvent }, { createRawSnippet }] = await Promise.all([
    import("@testing-library/svelte"),
    import("@testing-library/user-event"),
    import("svelte"),
  ]);

  return { render, screen, userEvent, createRawSnippet };
}
