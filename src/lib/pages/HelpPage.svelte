<script lang="ts">
  import SiteHeader from "../components/SiteHeader.svelte";
  import Card from "../ui/Card.svelte";

  const codeClass = "rounded bg-accent-soft px-1 py-0.5 text-ink";
</script>

<svelte:head>
  <title>Help — AI Photo Sorter</title>
</svelte:head>

<SiteHeader />

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
  <h1 class="text-3xl font-semibold tracking-tight text-ink">Help</h1>

  <Card>
    <h2 class="text-lg font-semibold text-ink">Categories and prompts</h2>
    <p class="mt-2 text-sm text-ink-muted">
      Enter one English category per line. MobileCLIP's text encoder only understands English, so
      translated labels produce almost random results. Each label is classified with the prompt
      <code class={codeClass}>a photo of &lt;label&gt;</code>, which noticeably improves short
      labels such as <code class={codeClass}>cat</code>.
    </p>
  </Card>

  <Card>
    <h2 class="text-lg font-semibold text-ink">What is inside a sorted ZIP</h2>
    <ul class="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-muted">
      <li>Photos are placed into folders named after their category.</li>
      <li>Only the file name is kept; directories inside the archive are not preserved.</li>
      <li>Duplicate names get a <code class={codeClass}> (2)</code> suffix.</li>
      <li>
        <code class={codeClass}>report.csv</code> at the root uses a BOM and CRLF line endings, and lists
        source, category, confidence and status.
      </li>
      <li>
        HEIC/TIFF files and images that fail to decode are skipped, but still appear in the report.
      </li>
    </ul>
  </Card>

  <Card>
    <h2 class="text-lg font-semibold text-ink">First run and offline use</h2>
    <p class="mt-2 text-sm text-ink-muted">
      The int8 MobileCLIP-B model is about 145 MB. It is downloaded from Hugging Face on first use
      and cached by the browser; inference then runs locally in a Web Worker and usually takes
      hundreds of milliseconds per photo. The app shell and cached model keep working offline.
      Accounts and metadata sync require the optional server, and sync stays off until you turn it
      on yourself.
    </p>
  </Card>
</main>
