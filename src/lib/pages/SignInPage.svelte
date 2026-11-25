<script lang="ts">
  import { onMount, tick } from "svelte";

  import { goto } from "$app/navigation";

  import { getAppContext } from "../app/context";
  import AuthForm from "../components/AuthForm.svelte";
  import SiteHeader from "../components/SiteHeader.svelte";
  import Button from "../ui/Button.svelte";
  import Card from "../ui/Card.svelte";

  const { app, view: readView } = getAppContext();
  let view = $derived(readView());

  async function redirectIfSignedIn(): Promise<void> {
    await tick();

    if (view.account.email !== null && view.account.error === null) {
      await goto("/app", { replace: true });
    }
  }

  onMount(() => {
    void app.checkSession().then(redirectIfSignedIn);
  });

  async function signIn(email: string, password: string): Promise<void> {
    await app.signIn(email, password);
    await redirectIfSignedIn();
  }

  async function signUp(email: string, password: string): Promise<void> {
    await app.signUp(email, password);
    await redirectIfSignedIn();
  }
</script>

<svelte:head>
  <title>Sign in — AI Photo Sorter</title>
</svelte:head>

<SiteHeader />

<main class="mx-auto flex max-w-md flex-col gap-6 px-6 py-12">
  <div class="flex flex-col gap-2">
    <h1 class="text-3xl font-semibold tracking-tight text-ink">Sign in</h1>
    <p class="text-sm text-ink-muted">
      An account is only for syncing metadata between devices. Sorting works without one.
    </p>
  </div>

  <Card>
    <AuthForm
      busy={view.account.busy}
      error={view.account.error}
      onSignIn={signIn}
      onSignUp={signUp}
    />
  </Card>

  <p class="rounded-lg border border-line bg-panel p-4 text-sm text-ink-muted">
    Sync stays off until you turn it on yourself in the account menu. Photos are never uploaded.
  </p>

  <Button variant="soft" onclick={() => void goto("/app")}>Continue as guest</Button>
</main>
