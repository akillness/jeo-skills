<!--
@component
The one popup every content renders into. It takes the open content's size
as --viewport-width and --viewport-height, and moves to the open trigger.
@stable
-->
<script lang="ts">
  import {
    navigationMenu,
    type NavigationMenuViewportProps,
    type NavigationMenuViewportState,
  } from "@ui-sdk/core/navigation-menu"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { portalTo, usePopupContainer } from "../popup.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ContainerKey, type ContainerContext } from "./context"

  let {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    container,
    ...rest
  }: PartProps<"div", NavigationMenuViewportState> &
    NavigationMenuViewportProps = $props()

  const menu = useHandle(navigationMenu)
  const fromRoot = getContext<ContainerContext | undefined>(ContainerKey)
  const target = usePopupContainer(() => container ?? fromRoot?.())
  const viewport = useHandlePart(
    menu,
    "viewport",
    () => ({
      side,
      align,
      sideOffset,
      alignOffset,
      collisionPadding,
      arrowPadding,
      anchor,
    }),
    portalTo(target)
  )
</script>

<Part tag="div" part={viewport} props={rest} />
