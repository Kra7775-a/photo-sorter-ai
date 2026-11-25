<script lang="ts">
  import { PRIVACY_STATEMENT } from "../app/copy";
  import SiteHeader from "../components/SiteHeader.svelte";
  import Card from "../ui/Card.svelte";
</script>

<svelte:head>
  <title>Privacy — AI Photo Sorter</title>
</svelte:head>

<SiteHeader />

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
  <h1 class="text-3xl font-semibold tracking-tight text-ink">Privacy</h1>

  <Card>
    <p class="text-base text-ink">{PRIVACY_STATEMENT}</p>
  </Card>

  <Card>
    <h2 class="text-lg font-semibold text-ink">What is stored where</h2>
    <ul class="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-muted">
      <li>Photos are classified in your browser and are never uploaded, even with an account.</li>
      <li>
        Sorting history stays in this browser by default. It only contains file names, categories,
        confidences and statuses, never the images themselves.
      </li>
      <li>
        If you sign in and explicitly turn on sync, file names and categories are encrypted and sent
        to the optional server so you can see the same history on another device.
      </li>
      <li>
        The server operator holds the decryption key and can access that metadata. Deleting your
        account from the account dialog also deletes the server data.
      </li>
    </ul>
  </Card>

  <p class="text-sm text-ink-muted">
    You can use every sorting feature as a guest, without creating an account or contacting a
    server.
  </p>
</main>
