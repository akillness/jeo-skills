<!--
@component
Renders into the viewport while its item is open, as its own popup without
a viewport, and in place while closed and kept.
@stable
-->
<script lang="ts">
  import {
    navigationMenu,
    type NavigationMenuContentProps,
    type NavigationMenuContentState,
  } from "@ui-sdk/core/navigation-menu"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import {
    portalTo,
    providePopupContainer,
    usePopupContainer,
  } from "../popup.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ContainerKey, useItem, type ContainerContext } from "./context"

  let {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    keepMounted,
    hiddenUntilFound,
    container,
    ...rest
  }: PartProps<"div", NavigationMenuContentState> & NavigationMenuContentProps =
    $props()

  const menu = useHandle(navigationMenu)
  const value = useItem("Content")
  const fromRoot = getContext<ContainerContext | undefined>(ContainerKey)
  const target = usePopupContainer(() => container ?? fromRoot?.())
  providePopupContainer(target)
  const content = useHandlePart(
    menu,
    "content",
    () => ({
      value: value(),
      side,
      align,
      sideOffset,
      alignOffset,
      collisionPadding,
      arrowPadding,
      anchor,
      keepMounted,
      hiddenUntilFound,
    }),
    portalTo(() => destination)
  )
  // Where the content lives. Its attributes change whenever it moves between
  // its item and the viewport, so they're read here, and the element moves
  // and binds again only when the answer changes: a content animating out
  // stays bound in the viewport.
  const destination = $derived.by(() => {
    content.attrs
    const viewport = menu.api.internal.viewportElement()
    if (viewport && menu.api.internal.inViewport(value())) {
      return viewport
    }
    // Kept in place next to a viewport, or its own popup without one.
    return menu.state.viewport ? false : target()
  })
</script>

{#if content.present}
  <Part tag="div" part={content} props={rest} />
{/if}
