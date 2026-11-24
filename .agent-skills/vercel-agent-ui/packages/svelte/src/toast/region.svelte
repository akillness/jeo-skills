<script lang="ts">
  import {
    toastRegion,
    type Toast as ToastData,
    type ToastItem,
    type ToastRegionState,
  } from "@ui-sdk/core/toast"
  import type { ToastRegionInternalOptions } from "@ui-sdk/core/renderer"
  import Part from "../part.svelte"
  import { portalTo } from "../popup.svelte"
  import { useHandlePart, usePrimitive } from "../use-primitive.svelte"
  import type { ToastContent, ToastRegionProps } from "./context"
  import DataToast from "./data-toast.svelte"
  import ToastScope from "./toast-scope.svelte"

  // The region, placed by the app or rendered by the overlay host.
  let {
    toaster,
    side,
    align,
    maxVisible,
    expanded,
    shortcut,
    pendingAnnouncement,
    debug,
    placed,
    container,
    "aria-label": label,
    children,
    ...rest
  }: ToastRegionProps & {
    /** Whether the app placed the region, rather than the overlay host rendering it. */
    placed: boolean
  } = $props()

  const id = $props.id()
  const region = usePrimitive(
    toastRegion,
    () =>
      ({
        id,
        toaster,
        side,
        align,
        maxVisible,
        expanded,
        shortcut,
        pendingAnnouncement,
        debug,
        placed,
        label: label ?? undefined,
      }) satisfies ToastRegionInternalOptions & { id: string }
  )
  const part = useHandlePart(
    region,
    "region",
    () => ({}),
    portalTo(() => container)
  )
  const list = useHandlePart(region, "list")
</script>

<!-- Each toast renders from the children snippet, else from its data. -->
{#snippet toasts(state: ToastRegionState)}
  <ol {...list.slot()}>
    {#each state.toasts as item (item.toast.id)}
      {@const toast = item.toast as ToastData<ToastContent>}
      <ToastScope {region} {toast}>
        {#if children}
          {@render children(toast, item as ToastItem<ToastContent>)}
        {:else}
          <DataToast {toast} />
        {/if}
      </ToastScope>
    {/each}
  </ol>
{/snippet}

<Part tag="section" {part} props={{ ...rest, children: toasts }} />
