<script lang="ts">
  import Alert from "../ui/Alert.svelte";
  import Button from "../ui/Button.svelte";
  import TextField from "../ui/TextField.svelte";

  type Props = {
    busy: boolean;
    error: string | null;
    onSignIn: (email: string, password: string) => Promise<void>;
    onSignUp: (email: string, password: string) => Promise<void>;
  };

  let { busy, error, onSignIn, onSignUp }: Props = $props();

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

<div class="flex flex-col gap-3">
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

  {#if error !== null}
    <Alert tone="danger" role="alert">{error}</Alert>
  {/if}
</div>
