<!--
@component
The panel itself, positioned against its trigger, named by its title and described by its description.
@stable
-->
<script lang="ts" generics="Payload = unknown">
  import {
    popover as popoverPrimitive,
    type PopoverContentProps,
    type PopoverContentState,
  } from "@ui-sdk/core/popover"
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
    initialFocus,
    finalFocus,
    keepMounted,
    inline,
    container,
    ...rest
  }: PartProps<"div", PopoverContentState<Payload>> &
    PopoverContentProps & {
      /** Renders the popup into this element instead of in place. */
      container?: PopupContainer
    } = $props()

  const popover = useHandle(popoverPrimitive)
  const fromRoot = getContext<ContainerContext | undefined>(ContainerKey)
  const target = usePopupContainer(() => container ?? fromRoot?.())
  providePopupContainer(target)
  // Presented as a sheet, the content sits in a full-screen viewport, which is
  // what moves into the container and the top layer.
  const viewport = useHandlePart(
    popover,
    "viewport",
    () => ({}),
    portalTo(() => (inline ? false : target()))
  )
  const content = useHandlePart(
    popover,
    "content",
    () => ({
      side,
      align,
      sideOffset,
      alignOffset,
      collisionPadding,
      arrowPadding,
      anchor,
      initialFocus,
      finalFocus,
      keepMounted,
      inline,
    }),
    portalTo(() => (inline || viewport.present ? false : target()))
  )
</script>

{#snippet popup()}
  <!-- The payload's type is the app's, from `Payload`; the part hands its state on as it is. -->
  <Part
    tag="div"
    part={content}
    props={rest as PartProps<"div", PopoverContentState>}
  />
{/snippet}

{#if content.present}
  {#if viewport.present}
    <div {...viewport.slot()}>{@render popup()}</div>
  {:else}
    {@render popup()}
  {/if}
{/if}
