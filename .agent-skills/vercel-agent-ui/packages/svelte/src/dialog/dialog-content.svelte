<!--
@component
The dialog itself, named by its title and described by its description.
@stable
-->
<script lang="ts" generics="Payload = unknown">
  import type {
    DialogContentProps,
    DialogContentState,
  } from "@ui-sdk/core/dialog"
  import Part from "../part.svelte"
  import {
    portalTo,
    providePopupContainer,
    usePopupContainer,
    type PopupContainer,
  } from "../popup.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDialog } from "./context"

  let {
    initialFocus,
    finalFocus,
    keepMounted,
    inline,
    container,
    ...rest
  }: PartProps<"div", DialogContentState<Payload>> &
    DialogContentProps & {
      /** Renders the popup into this element instead of in place. */
      container?: PopupContainer
    } = $props()

  const dialog = useDialog()
  const target = usePopupContainer(() => container ?? dialog.container())
  providePopupContainer(target)
  // Presented as a sheet, the content sits in a full-screen viewport, which is
  // what moves into the container and the top layer. An alert dialog never
  // presents as a sheet, so it has no viewport to bind.
  const viewport = dialog.sheet
    ? useHandlePart(
        dialog.handle,
        "viewport",
        () => ({}),
        portalTo(() => (inline ? false : target()))
      )
    : undefined
  const content = useHandlePart(
    dialog.handle,
    "content",
    () => ({ initialFocus, finalFocus, keepMounted, inline }),
    portalTo(() => (inline || viewport?.present ? false : target()))
  )
</script>

{#snippet popup()}
  <Part tag="div" part={content} props={rest} />
{/snippet}

{#if content.present}
  {#if viewport?.present}
    <div {...viewport.slot()}>{@render popup()}</div>
  {:else}
    {@render popup()}
  {/if}
{/if}
