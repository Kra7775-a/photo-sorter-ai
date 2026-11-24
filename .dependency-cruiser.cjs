/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies make architecture boundaries meaningless.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-src-to-server",
      severity: "error",
      comment: "Browser code must never import the Bun server.",
      from: { path: "^src/" },
      to: { path: "^server/" },
    },
    {
      name: "no-server-to-src",
      severity: "error",
      comment: "The Bun server must never import browser code.",
      from: { path: "^server/" },
      to: { path: "^src/" },
    },
    {
      name: "ui-is-leaf",
      severity: "error",
      comment: "UI kit components must not know about domain modules.",
      from: { path: "^src/lib/ui/" },
      to: { path: "^src/lib/", pathNot: "^src/lib/ui/" },
    },
    {
      name: "domain-no-ui",
      severity: "error",
      comment: "Domain controllers must not import UI or app wiring.",
      from: { path: "^src/lib/(archive|model|sorter|sync)/" },
      to: { path: "^src/lib/(ui|components|app)/" },
    },
    {
      name: "app-controller-no-ui",
      severity: "error",
      comment: "The app controller orchestrates features; it renders nothing.",
      from: { path: "^src/lib/app/" },
      to: { path: "^src/lib/(ui|components)/" },
    },
    {
      name: "archive-scope",
      severity: "error",
      comment: "Archive helpers may only use archive code and shared score types.",
      from: { path: "^src/lib/archive/" },
      to: { path: "^src/lib/", pathNot: "^src/lib/(archive|model/protocol)(/|$)" },
    },
    {
      name: "model-scope",
      severity: "error",
      comment: "Model modules stay inside the model feature.",
      from: { path: "^src/lib/model/" },
      to: { path: "^src/lib/", pathNot: "^src/lib/model/" },
    },
    {
      name: "sorter-scope",
      severity: "error",
      comment: "Sorter may use archive/model types and sync run types only.",
      from: { path: "^src/lib/sorter/" },
      to: {
        path: "^src/lib/",
        pathNot: "^src/lib/(sorter|archive|model/protocol|sync/types)(/|$)",
      },
    },
    {
      name: "sync-scope",
      severity: "error",
      comment: "Sync modules stay inside the sync feature.",
      from: { path: "^src/lib/sync/" },
      to: { path: "^src/lib/", pathNot: "^src/lib/sync/" },
    },
    {
      name: "components-scope",
      severity: "error",
      comment: "Feature UI shells may use the UI kit and controller types only.",
      from: { path: "^src/lib/components/" },
      to: {
        path: "^src/lib/",
        pathNot: "^src/lib/(ui|sorter/controller|sync/controller|sync/types)(/|$)",
      },
    },
    {
      name: "app-view-scope",
      severity: "error",
      comment: "App.svelte is a composition root: entry points only, no internals.",
      from: { path: "^src/App[.]svelte$" },
      to: {
        path: "^src/lib/",
        pathNot:
          "^src/lib/(app|components|ui|archive/sort|model/engine|sync/client|sync/controller|sync/store)[.]ts$|^src/lib/(app|components|ui)/",
      },
    },
    {
      name: "no-client-barrels",
      severity: "error",
      comment: "Client code avoids barrel files; import component files directly.",
      from: { path: "^src/" },
      to: { path: "^src/lib/.+/index[.](ts|js)$" },
    },
    {
      name: "server-routes-scope",
      severity: "error",
      comment: "Server feature modules must not import bootstrap or CLI scripts.",
      from: { path: "^server/(auth|runs|settings)[.]ts$" },
      to: { path: "^server/(index|main|keygen|rewrap)[.]ts$" },
    },
    {
      name: "server-cli-scope",
      severity: "error",
      comment: "CLI scripts may only use server infrastructure.",
      from: { path: "^server/(keygen|rewrap)[.]ts$" },
      to: { path: "^server/", pathNot: "^server/(config|db|crypto|keys)[.]ts$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: [
        "\\.test\\.",
        "component-test[.]ts$",
        "tests/e2e/",
        "[.]stryker-tmp/",
        "dist/",
        "coverage/",
      ],
    },
    tsConfig: { fileName: "tsconfig.json" },
  },
};
