<script lang="ts">
  import {
    ApertureIcon,
    DownloadSimpleIcon,
    FileZipIcon,
    ImagesIcon,
    SignOutIcon,
  } from "phosphor-svelte";

  type IconName = "brand" | "photos" | "archive" | "download" | "signOut";

  type Props = {
    name: IconName;
    size?: number;
    class?: string;
  };

  let { name, size = 18, class: className = "" }: Props = $props();

  const icons: Record<IconName, typeof ApertureIcon> = {
    brand: ApertureIcon,
    photos: ImagesIcon,
    archive: FileZipIcon,
    download: DownloadSimpleIcon,
    signOut: SignOutIcon,
  };

  const Icon = $derived(icons[name]);
</script>

<Icon {size} class={className} aria-hidden="true" focusable="false" />
