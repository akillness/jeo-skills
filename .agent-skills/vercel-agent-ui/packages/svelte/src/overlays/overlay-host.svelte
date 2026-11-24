<!--
@component
Renders what `toast()` and `confirm()` open, from anywhere in the app. Mount it once, near the root. A
`ToastRegion` you place yourself takes over its toaster.
@stable
-->
<script lang="ts">
  import type { ConfirmEntry } from "@ui-sdk/core/dialog"
  import type { Toaster } from "@ui-sdk/core/renderer"
  import {
    overlays as sharedOverlays,
    type OverlayEntry,
    type Overlays,
  } from "@ui-sdk/core/overlays"
  import HostedConfirm from "./hosted-confirm.svelte"
  import HostedToaster from "./hosted-toaster.svelte"
  import type { OverlayHostToastProps } from "./types"

  /**
   * Renders what `toast()` and `confirm()` open, from anywhere in the app.
   * Mount it once, near the root. A `ToastRegion` you place yourself takes over
   * its toaster.
   */
  let {
    overlays,
    toast,
  }: {
    /** The registry it renders. Defaults to the shared `overlays`, which `toast()` and `confirm()` open into. */
    overlays?: Overlays
    /** Props for the toast regions it renders, like `side` and `class`. */
    toast?: OverlayHostToastProps
  } = $props()

  const registry = $derived(overlays ?? sharedOverlays)
  // Read on the client, once mounted: the server renders no overlays, so the
  // first client render matches it, and the host is counted only while mounted.
  let entries = $state.raw<readonly OverlayEntry[]>([])
  $effect(() => {
    entries = registry.entries()
    const unsubscribe = registry.subscribe(() => (entries = registry.entries()))
    const release = registry.attachHost()
    return () => {
      unsubscribe()
      release()
      entries = []
    }
  })
</script>

{#each entries as entry (entry.id)}
  {#if entry.type === "toaster"}
    <HostedToaster
      toaster={(entry.data as { toaster: Toaster }).toaster}
      regionProps={toast}
    />
  {:else if entry.type === "confirm"}
    <HostedConfirm entry={entry.data as ConfirmEntry} />
  {/if}
{/each}
