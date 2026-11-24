<!--
@component
The popup. Without content it renders Previous, the heading, Next and a
grid for each month; every Calendar part works inside it.
@stable
-->
<script lang="ts">
  import type {
    DatePickerContentProps,
    DatePickerContentState,
  } from "@ui-sdk/core/date-picker"
  import { getContext } from "svelte"
  import CalendarGrid from "../calendar/calendar-grid.svelte"
  import CalendarHeading from "../calendar/calendar-heading.svelte"
  import CalendarNext from "../calendar/calendar-next.svelte"
  import CalendarPrevious from "../calendar/calendar-previous.svelte"
  import { monthOffsets } from "../calendar/context"
  import Part from "../part.svelte"
  import {
    portalTo,
    providePopupContainer,
    usePopupContainer,
    type PopupContainer,
  } from "../popup.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ContainerKey, useDatePicker, type ContainerContext } from "./context"

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
    children,
    ...rest
  }: PartProps<"div", DatePickerContentState> &
    Omit<DatePickerContentProps, "container"> & {
      /** Renders the popup into this element instead of in place. */
      container?: PopupContainer
    } = $props()

  const picker = useDatePicker("DatePickerContent")
  const fromRoot = getContext<ContainerContext | undefined>(ContainerKey)
  const target = usePopupContainer(() => container ?? fromRoot?.())
  providePopupContainer(target)
  // Presented as a sheet, the content sits in a full-screen viewport, which is
  // what moves into the container and the top layer.
  const viewport = useHandlePart(
    picker,
    "viewport",
    () => ({}),
    portalTo(target)
  )
  const content = useHandlePart(
    picker,
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
    portalTo(() => (viewport.present ? false : target()))
  )
  const offsets = $derived(monthOffsets(picker.months()))
</script>

{#snippet fallback()}
  <div>
    <CalendarPrevious />
    <CalendarHeading />
    <CalendarNext />
  </div>
  {#each offsets as offset (offset)}
    <CalendarGrid {offset} />
  {/each}
{/snippet}

{#snippet popup()}
  <Part
    tag="div"
    part={content}
    props={{ ...rest, children: children ?? fallback }}
  />
{/snippet}

{#if content.present}
  {#if viewport.present}
    <div {...viewport.slot()}>{@render popup()}</div>
  {:else}
    {@render popup()}
  {/if}
{/if}
