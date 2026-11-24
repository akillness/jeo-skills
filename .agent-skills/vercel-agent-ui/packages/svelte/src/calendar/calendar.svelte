<!--
@component
Months of days with one tab stop. Without content it renders a heading,
Previous and Next, and a grid for each month.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    calendar as calendarPrimitive,
    type CalendarMonthChangeReason,
    type CalendarOptions,
    type CalendarState,
    type CalendarValue,
    type CalendarValueChangeReason,
    type ISOMonth,
  } from "@ui-sdk/core/calendar"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { readOnlyOf } from "../text-control"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import CalendarGrid from "./calendar-grid.svelte"
  import CalendarHeading from "./calendar-heading.svelte"
  import CalendarNext from "./calendar-next.svelte"
  import CalendarPrevious from "./calendar-previous.svelte"
  import { CalendarKey, monthOffsets } from "./context"

  type ValueDetails = ChangeDetails<CalendarValueChangeReason>
  type MonthDetails = ChangeDetails<CalendarMonthChangeReason>

  let {
    mode,
    value = $bindable(),
    defaultValue,
    onValueChange,
    month = $bindable(),
    defaultMonth,
    onMonthChange,
    min,
    max,
    unavailable,
    disabled,
    readOnly,
    deselectable,
    onFocusedChange,
    onAnchorChange,
    months,
    pageBy,
    locale,
    weekStartsOn,
    weekdayFormat,
    monthFormat,
    fixedWeeks,
    showOutsideDays,
    today,
    timeZone,
    minDays,
    maxDays,
    allowUnavailable,
    controller,
    debug,
    children,
    ...rest
  }: PartProps<"div", CalendarState> &
    Omit<CalendarOptions, "value" | "month"> & {
      /** The selected value: an ISO date, a list of them, or `[start, end]`. Bind it with `bind:value` to control the calendar. */
      value?: CalendarValue
      /** The first month shown, like `"2026-10"`. Bind it with `bind:month` to control the calendar. */
      month?: ISOMonth
    } = $props()

  const id = $props.id()
  const calendar = usePrimitive(calendarPrimitive, () => ({
    id,
    mode,
    get value() {
      return value
    },
    defaultValue,
    onValueChange: (next: CalendarValue, details: ValueDetails) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    get month() {
      return month
    },
    defaultMonth,
    onMonthChange: (next: ISOMonth, details: MonthDetails) => {
      onMonthChange?.(next, details)
      if (!details.canceled) {
        month = next
      }
    },
    min,
    max,
    unavailable,
    disabled,
    readOnly: readOnlyOf(readOnly, rest),
    deselectable,
    onFocusedChange,
    onAnchorChange,
    months,
    pageBy,
    locale,
    weekStartsOn,
    weekdayFormat,
    monthFormat,
    fixedWeeks,
    showOutsideDays,
    today,
    timeZone,
    minDays,
    maxDays,
    allowUnavailable,
    controller,
    debug,
  }))
  setContext(CalendarKey, calendar)
  const root = useHandlePart(calendar, "root")
  const offsets = $derived(monthOffsets(months))
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

<Part
  tag="div"
  part={root}
  props={{ ...rest, children: children ?? fallback }}
/>
