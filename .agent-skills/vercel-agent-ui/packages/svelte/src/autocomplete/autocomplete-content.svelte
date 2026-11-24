<!--
@component
The popup that holds the suggestions, positioned against the field.
@stable
-->
<script lang="ts">
  import {
    autocomplete as autocompletePrimitive,
    type AutocompleteContentProps,
    type AutocompleteContentState,
  } from "@ui-sdk/core/autocomplete"
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
  import AutocompleteList from "./autocomplete-list.svelte"

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
  }: PartProps<"div", AutocompleteContentState> &
    AutocompleteContentProps & {
      /** Renders the suggestions into this element instead of in place. */
      container?: PopupContainer
      /** @internal The content a data autocomplete renders itself, which doesn't count as the app's. */
      fromRoot?: boolean
    } = $props()

  const autocomplete = useHandle(autocompletePrimitive)
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
  // that the field moves into.
  const viewport = useHandlePart(
    autocomplete,
    "viewport",
    () => ({}),
    portalTo(target)
  )
  const header = useHandlePart(autocomplete, "header")
  const recordHeader = useSheetHeader()
  const content = useHandlePart(
    autocomplete,
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

<!-- The sheet's header, then the content: yours, or the list of a data autocomplete. -->
{#snippet inside(state: AutocompleteContentState)}
  {#if header.present}<div {...header.slot()} {@attach recordHeader}></div>{/if}
  {#if children}
    {@render children(state)}
  {:else if autocomplete.state.items}
    <AutocompleteList />
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
