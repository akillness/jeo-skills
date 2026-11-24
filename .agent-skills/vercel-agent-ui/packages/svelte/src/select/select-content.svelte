<!--
@component
The popup that holds the items, positioned against the trigger.
@stable
-->
<script lang="ts">
  import {
    select as selectPrimitive,
    type SelectContentProps,
    type SelectContentState,
  } from "@ui-sdk/core/select"
  import { getContext, untrack } from "svelte"
  import { claimOwnPart } from "../own-part.svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import {
    portalTo,
    providePopupContainer,
    usePopupContainer,
    type PopupContainer,
  } from "../popup.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ContainerKey, OwnContentKey, type ContainerContext } from "./context"
  import SelectItems from "./select-items.svelte"

  let {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    alignItemWithTrigger,
    keepMounted,
    container,
    fromRoot,
    children,
    ...rest
  }: PartProps<"div", SelectContentState> &
    SelectContentProps & {
      /** Renders the list into this element instead of in place. */
      container?: PopupContainer
      /** @internal The content a data select renders itself, which doesn't count as the app's. */
      fromRoot?: boolean
    } = $props()

  const select = useHandle(selectPrimitive)
  // The root renders its own content when the app gives none, so one in the
  // app's children says it's there.
  if (!untrack(() => fromRoot)) {
    claimOwnPart(OwnContentKey)
  }
  const inherited = getContext<ContainerContext | undefined>(ContainerKey)
  const target = usePopupContainer(() => container ?? inherited?.())
  providePopupContainer(target)
  // Presented as a sheet, the content sits in a full-screen viewport, which is
  // what moves into the container and the top layer.
  const viewport = useHandlePart(
    select,
    "viewport",
    () => ({}),
    portalTo(target)
  )
  const content = useHandlePart(
    select,
    "content",
    () => ({
      side,
      align,
      sideOffset,
      alignOffset,
      collisionPadding,
      arrowPadding,
      anchor,
      alignItemWithTrigger,
      keepMounted,
    }),
    portalTo(() => (viewport.present ? false : target()))
  )
</script>

<!-- Without content, a data select renders its items. -->
{#snippet data(state: SelectContentState)}
  {#if select.state.items}<SelectItems items={state.items} />{/if}
{/snippet}

{#snippet popup()}
  <Part
    tag="div"
    part={content}
    props={{ ...rest, children: children ?? data }}
  />
{/snippet}

{#if content.present}
  {#if viewport.present}
    <div {...viewport.slot()}>{@render popup()}</div>
  {:else}
    {@render popup()}
  {/if}
{/if}
