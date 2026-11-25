<script lang="ts">
  import SiteHeader from "../components/SiteHeader.svelte";
  import Button from "../ui/Button.svelte";
</script>

<svelte:head>
  <title>Page not found — AI Photo Sorter</title>
</svelte:head>

<SiteHeader />

<main class="mx-auto flex max-w-3xl flex-col items-start gap-4 px-6 py-20">
  <h1 class="text-3xl font-semibold tracking-tight text-ink">Page not found</h1>
  <p class="text-sm text-ink-muted">
    We couldn't find that page. The sorter is available at <code>/app</code>.
  </p>
  <Button href="/" variant="soft">Back to the homepage</Button>
</main>
