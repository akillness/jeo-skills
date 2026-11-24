<!--
@component
The tooltip itself, positioned against its trigger.
Always in the page, hidden while closed, so the trigger can point at it.
@stable
-->
<script lang="ts" generics="Payload = unknown">
  import {
    tooltip as tooltipPrimitive,
    type TooltipContentProps,
    type TooltipContentState,
  } from "@ui-sdk/core/tooltip"
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
    container,
    ...rest
  }: PartProps<"div", TooltipContentState<Payload>> &
    TooltipContentProps & {
      /** Renders the popup into this element instead of in place. */
      container?: PopupContainer
    } = $props()

  const tooltip = useHandle(tooltipPrimitive)
  const fromRoot = getContext<ContainerContext | undefined>(ContainerKey)
  const target = usePopupContainer(() => container ?? fromRoot?.())
  providePopupContainer(target)
  const content = useHandlePart(
    tooltip,
    "content",
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

<!-- The payload's type is the app's, from `Payload`; the part hands its state on as it is. -->
<Part
  tag="div"
  part={content}
  props={rest as PartProps<"div", TooltipContentState>}
/>
