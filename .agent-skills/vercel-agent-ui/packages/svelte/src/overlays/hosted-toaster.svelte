<script lang="ts">
  import { toasterInternals, type Toaster } from "@ui-sdk/core/renderer"
  import { untrack } from "svelte"
  import Region from "../toast/region.svelte"
  import type { OverlayHostToastProps } from "./types"

  // A toaster's region, unless the app placed one of its own.
  let {
    toaster,
    regionProps,
  }: { toaster: Toaster; regionProps?: OverlayHostToastProps } = $props()

  // Read before the first render, so a region the app placed is never doubled
  // for a tick. The toaster is read once: an entry's toaster never changes.
  const internals = toasterInternals(untrack(() => toaster))
  let placed = $state(internals.hasPlacedRegion())
  $effect(() => toaster.subscribe(() => (placed = internals.hasPlacedRegion())))
</script>

{#if !placed}
  <Region {...regionProps} {toaster} placed={false} />
{/if}
