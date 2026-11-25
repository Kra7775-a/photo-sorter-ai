<script lang="ts">
  import Icon from "../ui/Icon.svelte";

  const linkClass =
    "rounded text-ink outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-focus";
  const ctaClass =
    "inline-flex h-9 items-center rounded-lg bg-accent px-4 font-medium text-on-accent outline-none hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
</script>

<header class="border-b border-line bg-panel">
  <nav
    class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4"
    aria-label="Public navigation"
  >
    <a
      href="/"
      class="inline-flex items-center gap-2 rounded-lg text-lg font-semibold tracking-tight text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Icon name="brand" size={24} />
      AI Photo Sorter
    </a>
    <div class="flex flex-wrap items-center gap-4 text-sm">
      <a href="/#how" class={linkClass}>How it works</a>
      <a href="/privacy" class={linkClass}>Privacy</a>
      <a href="/help" class={linkClass}>Help</a>
      <a href="/sign-in" class={linkClass}>Sign in</a>
      <a href="/app" class={ctaClass}>Try free</a>
    </div>
  </nav>
</header>
