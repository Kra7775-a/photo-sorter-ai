<script lang="ts">
  import SiteHeader from "../components/SiteHeader.svelte";
  import Card from "../ui/Card.svelte";
</script>

<svelte:head>
  <title>About — AI Photo Sorter</title>
</svelte:head>

<SiteHeader />

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
  <h1 class="text-3xl font-semibold tracking-tight text-ink">About</h1>

  <Card>
    <h2 class="text-lg font-semibold text-ink">The project</h2>
    <p class="mt-2 text-sm text-ink-muted">
      AI Photo Sorter groups photos by what they show. It is built around a small open-source vision
      model that runs entirely in the browser, so you can sort a collection without sending it
      anywhere. An account is optional and only exists to sync metadata between devices.
    </p>
  </Card>

  <Card>
    <h2 class="text-lg font-semibold text-ink">The stack</h2>
    <p class="mt-2 text-sm text-ink-muted">
      SvelteKit in SPA mode with Svelte 5 runes, Tailwind CSS v4 and TypeScript. Transformers.js and
      ONNX Runtime Web run MobileCLIP-B in int8 inside a Web Worker. ZIP files are read with zip.js
      and written with client-zip. A small Bun server provides the optional account and sync API.
    </p>
  </Card>

  <Card>
    <h2 class="text-lg font-semibold text-ink">Limitations</h2>
    <ul class="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-muted">
      <li>The text encoder is English-only, so categories must be written in English.</li>
      <li>The first run downloads about 145 MB of model files before sorting can start.</li>
      <li>
        MobileCLIP-B is small: results are approximate, and short or ambiguous labels need review.
      </li>
      <li>HEIC and TIFF images cannot be decoded by the browser and are skipped.</li>
      <li>Sync is unavailable when the app is used without the optional server.</li>
    </ul>
  </Card>
</main>
