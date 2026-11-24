<!--
@component
Shows a toaster's toasts. Place it once, or let `<OverlayHost />` render it.
@stable
-->
<script lang="ts">
  import type { ToastRegionProps } from "./context"
  import Region from "./region.svelte"

  /** Shows a toaster's toasts. Place it once, or let `<OverlayHost />` render it. */
  let { ...props }: ToastRegionProps = $props()
</script>

<Region {...props} placed />
