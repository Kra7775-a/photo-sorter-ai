<script lang="ts">
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
    onSignIn: (email: string, password: string) => Promise<void>;
    onSignUp: (email: string, password: string) => Promise<void>;
    onSignOut: () => Promise<void>;
    onDeleteAccount: (password: string) => Promise<void>;
    onSyncChange: (enabled: boolean) => void;
  };

  let {
    email,
    syncEnabled,
    busy,
    error,
    onSignIn,
    onSignUp,
    onSignOut,
    onDeleteAccount,
    onSyncChange,
  }: Props = $props();

  // Exact wording from the design spec: honest about server-side encryption and
  // the operator's access, and explicit that sync is opt-in.
  const PRIVACY_TEXT =
    "Photos never leave your device. File names and categories are stored encrypted on the server; the server operator has access to them. Sync is off until you turn it on yourself.";

  type Mode = "sign-in" | "sign-up";

  let mode = $state<Mode>("sign-in");
  let inputEmail = $state("");
  let password = $state("");

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const name = inputEmail.trim();

    if (busy || name === "" || password === "") {
      return;
    }

    const action = mode === "sign-in" ? onSignIn : onSignUp;

    await action(name, password);
    password = "";
  }
</script>

<Card padding="sm">
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-ink">Account</h2>
      {#if email !== null}
        <span class="max-w-full truncate text-xs text-ink-muted" title={email}>{email}</span>
      {:else}
        <span class="text-xs text-ink-muted">
          no account — everything is stored only in your browser
        </span>
      {/if}
    </div>

    {#if email === null}
      <div class="flex gap-2" role="group" aria-label="Sign-in mode">
        <Button
          size="sm"
          variant={mode === "sign-in" ? "solid" : "ghost"}
          onclick={() => (mode = "sign-in")}
        >
          Sign in
        </Button>
        <Button
          size="sm"
          variant={mode === "sign-up" ? "solid" : "ghost"}
          onclick={() => (mode = "sign-up")}
        >
          Sign up
        </Button>
      </div>

      <form class="flex flex-col gap-2" onsubmit={submit}>
        <TextField
          bind:value={inputEmail}
          type="email"
          label="Email"
          autocomplete="email"
          disabled={busy}
          required
        />
        <TextField
          bind:value={password}
          type="password"
          label="Password"
          autocomplete={mode === "sign-in" ? "current-password" : "new-password"}
          disabled={busy}
          required
        />
        <div>
          <Button type="submit" disabled={busy}>
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </div>
      </form>
    {:else}
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
          description={PRIVACY_TEXT}
          onchange={onSyncChange}
        />
      </div>
    {/if}

    {#if error !== null}
      <Alert tone="danger" role="alert">{error}</Alert>
    {/if}
  </div>
</Card>
