<!--
@component
The popup that holds the list, positioned against the input.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxContentProps,
    type ComboboxContentState,
  } from "@ui-sdk/core/combobox"
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
  import { useSheetHeader } from "../sheet-header.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ContainerKey, OwnContentKey, type ContainerContext } from "./context"
  import ComboboxList from "./combobox-list.svelte"

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
  }: PartProps<"div", ComboboxContentState> &
    ComboboxContentProps & {
      /** Renders the list into this element instead of in place. */
      container?: PopupContainer
      /** @internal The content a data combobox renders itself, which doesn't count as the app's. */
      fromRoot?: boolean
    } = $props()

  const combobox = useHandle(comboboxPrimitive)
  // The root renders its own content when the app gives none, so one in the
  // app's children says it's there.
  if (!untrack(() => fromRoot)) {
    claimOwnPart(OwnContentKey)
  }
  const inherited = getContext<ContainerContext | undefined>(ContainerKey)
  const target = usePopupContainer(() => container ?? inherited?.())
  providePopupContainer(target)
  // Presented as a sheet, the content sits in a full-screen viewport, which is
  // what moves into the container and the top layer, with a header at its top
  // that the input moves into.
  const viewport = useHandlePart(
    combobox,
    "viewport",
    () => ({}),
    portalTo(target)
  )
  const header = useHandlePart(combobox, "header")
  const recordHeader = useSheetHeader()
  const content = useHandlePart(
    combobox,
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
    portalTo(() => (viewport.present ? false : target()))
  )
</script>

<!-- The sheet's header, then the content: yours, or the list of a data combobox. -->
{#snippet inside(state: ComboboxContentState)}
  {#if header.present}<div {...header.slot()} {@attach recordHeader}></div>{/if}
  {#if children}
    {@render children(state)}
  {:else if combobox.state.items}
    <ComboboxList />
  {/if}
{/snippet}

{#snippet popup()}
  <Part tag="div" part={content} props={{ ...rest, children: inside }} />
{/snippet}

{#if content.present}
  {#if viewport.present}
    <div {...viewport.slot()}>{@render popup()}</div>
  {:else}
    {@render popup()}
  {/if}
{/if}
