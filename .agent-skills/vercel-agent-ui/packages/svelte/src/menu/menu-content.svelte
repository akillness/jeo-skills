<!--
@component
The popup that holds the items, positioned against the trigger that opened it.
@stable
-->
<script lang="ts" generics="Payload = unknown">
  import {
    menu as menuPrimitive,
    type MenuContentProps,
    type MenuContentState,
  } from "@ui-sdk/core/menu"
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

  let {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    finalFocus,
    keepMounted,
    container,
    fromRoot,
    ...rest
  }: PartProps<"div", MenuContentState<Payload>> &
    MenuContentProps & {
      /** Renders the popup into this element instead of in place. Submenus stay inside their parent's popup. */
      container?: PopupContainer
      /** @internal The content a data menu renders itself, which doesn't count as the app's. */
      fromRoot?: boolean
    } = $props()

  const menu = useHandle(menuPrimitive)
  const inherited = getContext<ContainerContext | undefined>(ContainerKey)
  const target = usePopupContainer(() => container ?? inherited?.())
  providePopupContainer(target)
  // A submenu renders inside its parent's popup and moves with it, so its
  // element stays in its block: Svelte removes a block's nodes by walking
  // from first to last, which an element moved elsewhere would escape.
  const nested = menu.api.root() !== menu.api
  // The root renders its own content when the app gives none, so a root
  // content in the app's children says it's there.
  if (!nested && !untrack(() => fromRoot)) {
    claimOwnPart(OwnContentKey)
  }
  // Presented as a sheet, a root menu sits in a full-screen viewport, which is
  // what moves into the container and the top layer.
  const viewport = useHandlePart(menu, "viewport", () => ({}), portalTo(target))
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
      finalFocus,
      keepMounted,
    }),
    portalTo(() => (nested || viewport.present ? false : target()))
  )
</script>

{#snippet popup()}
  <!-- The payload's type is the app's, from `Payload`; the part hands its state on as it is. -->
  <Part
    tag="div"
    part={content}
    props={rest as PartProps<"div", MenuContentState>}
  />
{/snippet}

{#if content.present}
  {#if viewport.present}
    <div {...viewport.slot()}>{@render popup()}</div>
  {:else}
    {@render popup()}
  {/if}
{/if}
