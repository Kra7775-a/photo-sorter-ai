import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { compile, compileModule } from "svelte/compiler";

import { plugin } from "bun";

/**
 * Bun test preload: compile Svelte 5 components and rune modules so component
 * tests can import them. The DOM itself is registered locally in component
 * tests, so server/archive tests keep Node globals.
 */
plugin({
  name: "svelte-test-loader",
  setup(builder) {
    // Bun resolves `svelte` to the server build; component tests need the client.
    builder.onResolve({ filter: /^svelte$/ }, () => ({
      path: resolve("node_modules/svelte/src/index-client.js"),
    }));

    builder.onLoad({ filter: /\.svelte$/ }, ({ path }) => {
      const source = readFileSync(path, "utf8");
      const result = compile(source, {
        filename: path,
        generate: "client",
        dev: false,
        runes: true,
      });

      return { contents: result.js.code, loader: "js" };
    });

    builder.onLoad({ filter: /\.svelte\.(js|ts)$/ }, ({ path }) => {
      const source = readFileSync(path, "utf8");
      const result = compileModule(source, { filename: path, dev: false });

      return { contents: result.js.code, loader: "js" };
    });
  },
});
