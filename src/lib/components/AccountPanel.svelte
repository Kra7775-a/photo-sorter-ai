<script lang="ts">
  import { PRIVACY_STATEMENT } from "../app/copy";
  import Alert from "../ui/Alert.svelte";
  import Button from "../ui/Button.svelte";
  import Card from "../ui/Card.svelte";
  import Icon from "../ui/Icon.svelte";
  import Switch from "../ui/Switch.svelte";
  import TextField from "../ui/TextField.svelte";

  type Props = {
    email: string | null;
    syncEnabled: boolean;
    busy: boolean;
    error: string | null;
    onSignOut: () => Promise<void>;
    onDeleteAccount: (password: string) => Promise<void>;
    onSyncChange: (enabled: boolean) => void;
  };

  let { email, syncEnabled, busy, error, onSignOut, onDeleteAccount, onSyncChange }: Props =
    $props();

  let password = $state("");
</script>

<Card padding="sm">
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-ink">Account</h2>
      <span class="max-w-full truncate text-xs text-ink-muted" title={email ?? ""}
        >{email ?? ""}</span
      >
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
      <span class="text-sm font-medium text-ink">Signed in</span>
      <Button variant="outline" size="sm" onclick={onSignOut} disabled={busy}>
        <Icon name="signOut" />
        Sign out
      </Button>
    </div>

    <details class="rounded-lg border border-line p-3 text-xs">
      <summary
        class="cursor-pointer text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Delete account and server data
      </summary>
      <p class="mt-2 text-ink-muted">
        Local history stays on this device. Enter your password to confirm.
      </p>
      <form
        class="mt-2 flex flex-col gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          if (password) {
            void onDeleteAccount(password);
          }
        }}
      >
        <TextField
          bind:value={password}
          type="password"
          label="Password"
          placeholder="Password"
          disabled={busy}
        />
        <div>
          <Button type="submit" tone="danger" size="sm" disabled={busy || password === ""}>
            Delete permanently
          </Button>
        </div>
      </form>
    </details>

    <div class="rounded-lg bg-accent-soft p-3">
      <Switch
        checked={syncEnabled}
        label="Sync metadata"
        description={PRIVACY_STATEMENT}
        onchange={onSyncChange}
      />
    </div>

    {#if error !== null}
      <Alert tone="danger" role="alert">{error}</Alert>
    {/if}
  </div>
</Card>
