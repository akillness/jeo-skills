<!--
@component
The card itself, positioned against its trigger.
@stable
-->
<script lang="ts" generics="Payload = unknown">
  import {
    hoverCard as hoverCardPrimitive,
    type HoverCardContentProps,
    type HoverCardContentState,
  } from "@ui-sdk/core/hover-card"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import {
    portalTo,
    providePopupContainer,
    usePopupContainer,
    type PopupContainer,
  } from "../popup.svelte"
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
    keepMounted,
    container,
    ...rest
  }: PartProps<"div", HoverCardContentState<Payload>> &
    HoverCardContentProps & {
      /** Renders the popup into this element instead of in place. */
      container?: PopupContainer
    } = $props()

  const hoverCard = useHandle(hoverCardPrimitive)
  const fromRoot = getContext<ContainerContext | undefined>(ContainerKey)
  const target = usePopupContainer(() => container ?? fromRoot?.())
  providePopupContainer(target)
  const content = useHandlePart(
    hoverCard,
    "content",
    () => ({
      side,
      align,
      sideOffset,
      alignOffset,
      collisionPadding,
      arrowPadding,
      anchor,
      keepMounted,
    }),
    portalTo(target)
  )
</script>

{#if content.present}
  <!-- The payload's type is the app's, from `Payload`; the part hands its state on as it is. -->
  <Part
    tag="div"
    part={content}
    props={rest as PartProps<"div", HoverCardContentState>}
  />
{/if}
