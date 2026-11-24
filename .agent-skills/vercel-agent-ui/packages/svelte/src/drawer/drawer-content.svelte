<!--
@component
The sheet itself, a dialog, inside a full-screen viewport the drawer positions it in.
@stable
-->
<script lang="ts" generics="Payload = unknown">
  import type {
    DrawerContentProps,
    DrawerContentState,
  } from "@ui-sdk/core/drawer"
  import Part from "../part.svelte"
  import {
    portalTo,
    providePopupContainer,
    usePopupContainer,
    type PopupContainer,
  } from "../popup.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDrawer } from "./context"

  let {
    initialFocus,
    finalFocus,
    keepMounted,
    container,
    ...rest
  }: PartProps<"div", DrawerContentState<Payload>> &
    DrawerContentProps & {
      /** Renders the drawer into this element instead of in place. */
      container?: PopupContainer
    } = $props()

  const drawer = useDrawer()
  const target = usePopupContainer(() => container ?? drawer.container())
  providePopupContainer(target)
  // The viewport is what moves into the container and the top layer.
  const viewport = useHandlePart(
    drawer.handle,
    "viewport",
    () => ({}),
    portalTo(target)
  )
  const content = useHandlePart(
    drawer.handle,
    "content",
    () => ({ initialFocus, finalFocus, keepMounted }),
    portalTo(() => (viewport.present ? false : target()))
  )
</script>

{#snippet popup()}
  <Part tag="div" part={content} props={rest} />
{/snippet}

{#if content.present}
  {#if viewport.present}
    <div {...viewport.slot()}>{@render popup()}</div>
  {:else}
    {@render popup()}
  {/if}
{/if}
