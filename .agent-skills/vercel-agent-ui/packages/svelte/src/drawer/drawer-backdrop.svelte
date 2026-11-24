<!--
@component
A dim behind the drawer. Its opacity follows the drawer, so give it a color like `bg-black/20`.
@stable
-->
<script lang="ts">
  import type { DrawerBackdropState } from "@ui-sdk/core/drawer"
  import Part from "../part.svelte"
  import { portalTo, usePopupContainer } from "../popup.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDrawer } from "./context"

  let props: PartProps<"div", DrawerBackdropState> = $props()

  const drawer = useDrawer()
  const backdrop = useHandlePart(
    drawer.handle,
    "backdrop",
    () => ({}),
    portalTo(usePopupContainer(drawer.container))
  )
</script>

{#if backdrop.present}
  <Part tag="div" part={backdrop} {props} />
{/if}
