<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { createAuthClient } from "better-auth/client";
  import { registerSW } from "virtual:pwa-register";

  import { setAppContext } from "../lib/app/context";
  import { createAppController, emptyAppSnapshot, type AppSnapshot } from "../lib/app/controller";
  import { sortArchive } from "../lib/archive/sort";
  import { createEngine } from "../lib/model/engine";
  import { createSyncClient } from "../lib/sync/client";
  import { createSyncController } from "../lib/sync/controller";
  import { openStore } from "../lib/sync/store";

  import "../app.css";

  let { children } = $props();

  let view = $state.raw<AppSnapshot>(emptyAppSnapshot());
  const app = createAppController({
    authClient: createAuthClient(),
    syncClient: createSyncClient({ baseUrl: window.location.origin }),
    createEngine,
    sortArchive,
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    storage: localStorage,
    cookie: () => document.cookie,
    openStore,
    createSyncController,
    onSnapshot: (snapshot) => {
      view = snapshot;
    },
  });
  setAppContext({ app, view: () => view });
  onMount(() => {
    registerSW();
    void app.start();
    return () => app.stop();
  });
  onDestroy(() => {
    app.dispose();
    app.stop();
  });
</script>

{@render children()}
