<!--
@component
The popup that holds the suggestions, anchored at the caret.
@stable
-->
<script lang="ts">
  import {
    triggerMenu,
    type TriggerMenuContentProps,
    type TriggerMenuContentState,
  } from "@ui-sdk/core/trigger-menu"
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
  import TriggerMenuList from "./trigger-menu-list.svelte"

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
    fromRoot,
    children,
    ...rest
  }: PartProps<"div", TriggerMenuContentState> &
    TriggerMenuContentProps & {
      /** Renders the list into this element instead of in place. */
      container?: PopupContainer
      /** @internal The content the menu renders itself, which doesn't count as the app's. */
      fromRoot?: boolean
    } = $props()

  const menu = useHandle(triggerMenu)
  // The root renders its own content when the app gives none, so one in the
  // app's children says it's there.
  if (!untrack(() => fromRoot)) {
    claimOwnPart(OwnContentKey)
  }
  const inherited = getContext<ContainerContext | undefined>(ContainerKey)
  const target = usePopupContainer(() => container ?? inherited?.())
  providePopupContainer(target)
  const content = useHandlePart(
    menu,
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

<!-- Without content, the menu renders the current trigger's items. -->
{#snippet list()}
  <TriggerMenuList />
{/snippet}

{#if content.present}
  <Part
    tag="div"
    part={content}
    props={{ ...rest, children: children ?? list }}
  />
{/if}
