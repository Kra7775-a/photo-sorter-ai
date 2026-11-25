<script lang="ts">
  import { tick } from "svelte";

  import { goto } from "$app/navigation";

  import { getAppContext } from "../app/context";
  import Dialog from "../ui/Dialog.svelte";
  import Icon from "../ui/Icon.svelte";
  import AccountPanel from "./AccountPanel.svelte";

  const { app, view: readView } = getAppContext();
  let view = $derived(readView());
  let account = $derived(view.account);

  const linkClass =
    "rounded text-ink outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-focus";
  const guestClass =
    "inline-flex h-9 items-center rounded-full border border-accent-line px-4 text-sm font-medium text-accent outline-none hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-focus";

  async function goToHistory(event: MouseEvent): Promise<void> {
    event.preventDefault();
    await goto("/app#history");
    await tick();
    document.getElementById("history")?.scrollIntoView({ behavior: "smooth" });
  }
</script>

<header class="border-b border-line bg-panel">
  <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
    <a
      href="/app"
      class="inline-flex items-center gap-2 rounded-lg text-base font-semibold tracking-tight text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Icon name="brand" size={22} />
      AI Photo Sorter
    </a>
    <nav class="flex flex-wrap items-center gap-4 text-sm" aria-label="App navigation">
      <a href="/app" class={linkClass}>Sorter</a>
      <a href="/app#history" class={linkClass} onclick={goToHistory}>History</a>
      <a href="/help" class={linkClass}>Help</a>
    </nav>
    {#if account.email === null}
      <a href="/sign-in" class={guestClass}>Sign in</a>
    {:else}
      <Dialog size="md">
        {#snippet trigger()}
          <span class="inline-flex items-center gap-2" aria-label="Account">
            <span
              class="inline-flex size-6 items-center justify-center rounded-full bg-panel text-xs font-semibold"
            >
              {(account.email ?? "").slice(0, 1).toUpperCase()}
            </span>
            <span class="max-w-36 truncate">{(account.email ?? "").slice(0, 40)}</span>
          </span>
        {/snippet}
        {#snippet title()}Account{/snippet}
        <AccountPanel
          email={account.email}
          syncEnabled={account.syncEnabled}
          busy={account.busy}
          error={account.error}
          onSignOut={() => app.signOut()}
          onDeleteAccount={(password) => app.deleteAccount(password)}
          onSyncChange={(next) => void app.setSync(next)}
        />
      </Dialog>
    {/if}
  </div>
</header>
