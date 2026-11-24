<!--
@component
A trace's spans on a shared time axis, as a tree of rows you expand and
collapse, with one tab stop. Without children, it renders a row for every span.
@experimental
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    waterfall as waterfallPrimitive,
    type ListHighlightDetails,
    type NumberFormat,
    type WaterfallBarLabelDetails,
    type WaterfallController,
    type WaterfallData,
    type WaterfallDataItem,
    type WaterfallExpandedChangeReason,
    type WaterfallState,
    type WaterfallValueChangeReason,
  } from "@ui-sdk/core/waterfall"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import WaterfallBar from "./waterfall-bar.svelte"
  import WaterfallIndicator from "./waterfall-indicator.svelte"
  import WaterfallRowHeader from "./waterfall-row-header.svelte"
  import WaterfallRow from "./waterfall-row.svelte"

  let {
    items,
    range,
    value = $bindable(),
    defaultValue,
    expanded = $bindable(),
    defaultExpanded,
    format,
    locale,
    getBarLabel,
    controller,
    debug,
    onValueChange,
    onExpandedChange,
    onHighlight,
    children,
    ...rest
  }: PartProps<"div", WaterfallState> & {
    /** The spans, each with a `value`, a `label`, a `start`, a `duration` and the spans it started as `children`. */
    items: WaterfallData
    /** The stretch of time the axis shows, as `[start, end]` in milliseconds. Bars outside it shrink to its edges. Change it to zoom or pan. */
    range?: [number, number]
    /** The selected span's value. Bind it with `bind:value` to control the selection. `null` selects nothing. */
    value?: string | null
    /** The span selected at first, when uncontrolled. */
    defaultValue?: string | null
    /** The expanded spans' values. Bind it with `bind:expanded` to control which spans show their children. */
    expanded?: string[]
    /** The spans expanded at first, when uncontrolled. */
    defaultExpanded?: string[]
    /** How times read on the axis and to screen readers: `Intl.NumberFormat` options for a number of milliseconds, or a function of it. */
    format?: NumberFormat
    /** The locale times are formatted in. Defaults to the page's `lang`, or the browser's language without one. */
    locale?: string
    /** What screen readers hear for a span's bar. Set it in the page's language. */
    getBarLabel?: (
      item: WaterfallDataItem,
      details: WaterfallBarLabelDetails
    ) => string
    /** Drives the waterfall from anywhere. Create one with `createWaterfallController()`. */
    controller?: WaterfallController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when the selection wants to change. `details.reason` says why, and `details.cancel()` stops it. */
    onValueChange?: (
      value: string | null,
      details: ChangeDetails<WaterfallValueChangeReason>
    ) => void
    /** Runs when spans want to expand or collapse. `details.reason` says why, and `details.cancel()` stops it. */
    onExpandedChange?: (
      expanded: string[],
      details: ChangeDetails<WaterfallExpandedChangeReason>
    ) => void
    /** Runs when the keyboard moves focus to a row, with its place among the rows that show, from 0. */
    onHighlight?: (value: string, details: ListHighlightDetails) => void
  } = $props()

  const id = $props.id()
  const waterfall = usePrimitive(waterfallPrimitive, () => ({
    id,
    items,
    range,
    get value() {
      return value
    },
    defaultValue,
    get expanded() {
      return expanded
    },
    defaultExpanded,
    format,
    locale,
    getBarLabel,
    controller,
    debug,
    onValueChange: (
      next: string | null,
      details: ChangeDetails<WaterfallValueChangeReason>
    ) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onExpandedChange: (
      next: string[],
      details: ChangeDetails<WaterfallExpandedChangeReason>
    ) => {
      onExpandedChange?.(next, details)
      if (!details.canceled) {
        expanded = next
      }
    },
    onHighlight,
  }))
  provideInstance(waterfallPrimitive, waterfall)
  const root = useHandlePart(waterfall, "root")
  // The core reads the spans from `items`, so they're read here to stay in sync.
  const spans = $derived.by(() => {
    items
    return waterfall.api.internal.all()
  })
</script>

{#snippet rows(_state: WaterfallState)}
  {#each spans as span (span.value)}
    <WaterfallRow value={span.value}>
      <WaterfallRowHeader>
        {#if span.children}<WaterfallIndicator />{/if}
        {span.label}
      </WaterfallRowHeader>
      <WaterfallBar />
    </WaterfallRow>
  {/each}
{/snippet}

<Part tag="div" part={root} props={{ ...rest, children: children ?? rows }} />
