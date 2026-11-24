<script lang="ts">
  import { OverlayHost } from "../../src/overlays"
  import { Toast, ToastRegion, ToastTitle } from "../../src/toast"

  let { host = false }: { host?: boolean } = $props()
</script>

{#if host}
  <OverlayHost />
{:else}
  <ToastRegion side="top" align="center">
    <Toast><ToastTitle /></Toast>
  </ToastRegion>
{/if}
