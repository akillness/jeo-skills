<!--
@component
A dim behind the dialog. It's optional: without it, style the content's `::backdrop`.
@stable
-->
<script lang="ts">
  import type { DialogBackdropState } from "@ui-sdk/core/dialog"
  import Part from "../part.svelte"
  import { portalTo, usePopupContainer } from "../popup.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDialog } from "./context"

  let props: PartProps<"div", DialogBackdropState> = $props()

  const dialog = useDialog()
  // Rendered where the content renders, so it sits in the top layer just below it.
  const backdrop = useHandlePart(
    dialog.handle,
    "backdrop",
    () => ({}),
    portalTo(usePopupContainer(dialog.container))
  )
</script>

{#if backdrop.present}
  <Part tag="div" part={backdrop} {props} />
{/if}
