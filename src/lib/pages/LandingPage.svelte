<script lang="ts">
  import SiteHeader from "../components/SiteHeader.svelte";
  import Card from "../ui/Card.svelte";
  import Icon from "../ui/Icon.svelte";

  const primaryCta =
    "inline-flex h-11 items-center justify-center rounded-lg bg-accent px-5 font-medium text-on-accent outline-none hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
  const secondaryCta =
    "inline-flex h-11 items-center justify-center rounded-lg border border-accent-line px-5 font-medium text-accent outline-none hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-focus";
  const textLink =
    "inline-flex rounded text-sm font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus";
</script>

<svelte:head>
  <title>AI Photo Sorter — photos stay on your device</title>
  <meta
    name="description"
    content="Sort photos and ZIP archives locally with MobileCLIP. No account required, no photos uploaded."
  />
</svelte:head>

<SiteHeader />

<main class="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-16">
  <section class="flex flex-col gap-6 text-center">
    <h1 class="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
      Photos stay on your device
    </h1>
    <p class="mx-auto max-w-2xl text-lg text-ink-muted">
      Sort photos and ZIP archives with a local AI model. No account, no uploads — the optional
      server is only for metadata sync you turn on yourself.
    </p>
    <div class="flex flex-wrap items-center justify-center gap-3">
      <a href="/app" class={primaryCta}>Try without account</a>
      <a href="/sign-in" class={secondaryCta}>Sign in</a>
    </div>
  </section>

  <section class="grid gap-4 sm:grid-cols-3" aria-label="Features">
    <Card>
      <Icon name="photos" size={24} />
      <h2 class="mt-4 text-base font-semibold text-ink">Local by default</h2>
      <p class="mt-2 text-sm text-ink-muted">
        The model runs in a Web Worker on your machine. Images are never uploaded anywhere.
      </p>
    </Card>
    <Card>
      <Icon name="brand" size={24} />
      <h2 class="mt-4 text-base font-semibold text-ink">Categories you control</h2>
      <p class="mt-2 text-sm text-ink-muted">
        Enter English labels, one per line. Each one is matched with a short photo prompt, and you
        can edit the list at any time.
      </p>
    </Card>
    <Card>
      <Icon name="archive" size={24} />
      <h2 class="mt-4 text-base font-semibold text-ink">ZIP in, ZIP out</h2>
      <p class="mt-2 text-sm text-ink-muted">
        Sort a whole archive in one pass: category folders, duplicate-safe names and a CSV report.
      </p>
    </Card>
  </section>

  <section id="how" class="flex scroll-mt-6 flex-col gap-4">
    <h2 class="text-2xl font-semibold tracking-tight text-ink">How it works</h2>
    <ol class="flex flex-col gap-3">
      <li class="rounded-lg border border-line bg-panel p-4 text-sm text-ink-muted">
        <span class="font-semibold text-ink">Pick a source.</span> Choose photos from your device or drop
        a ZIP archive into the sorter.
      </li>
      <li class="rounded-lg border border-line bg-panel p-4 text-sm text-ink-muted">
        <span class="font-semibold text-ink">Review the categories.</span> The default English labels
        are a starting point; replace them with your own.
      </li>
      <li class="rounded-lg border border-line bg-panel p-4 text-sm text-ink-muted">
        <span class="font-semibold text-ink">Let the model work.</span> The first run downloads about
        145 MB and caches it in your browser; later runs are much faster.
      </li>
      <li class="rounded-lg border border-line bg-panel p-4 text-sm text-ink-muted">
        <span class="font-semibold text-ink">Take the result.</span> Browse the matches or download a
        sorted ZIP with a report. Local history stays in this browser.
      </li>
    </ol>
  </section>

  <section class="flex flex-col gap-3 rounded-xl border border-line bg-panel p-6">
    <h2 class="text-lg font-semibold text-ink">Your privacy</h2>
    <p class="text-sm text-ink-muted">
      Photos never leave your device. Metadata sync is off by default and stays off until you enable
      it yourself.
    </p>
    <a href="/privacy" class={textLink}>Read the privacy note</a>
  </section>
</main>
