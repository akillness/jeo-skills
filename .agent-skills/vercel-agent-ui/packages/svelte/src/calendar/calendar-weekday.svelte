<!--
@component
A weekday's column header. Shows its name in `weekdayFormat` unless it has content.
@stable
-->
<script lang="ts">
  import type { CalendarWeekdayState } from "@ui-sdk/core/calendar"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useCalendar, useCalendarGrid } from "./context"

  let {
    index,
    children,
    ...rest
  }: PartProps<"th", CalendarWeekdayState> & {
    /** The column, from 0. */
    index: number
  } = $props()

  const calendar = useCalendar("CalendarWeekday")
  const grid = useCalendarGrid("CalendarWeekday")
  const weekday = useHandlePart(calendar, "weekday", () => ({
    index,
    id: `${grid.offset}-${index}`,
  }))
</script>

{#snippet fallback(state: CalendarWeekdayState)}{state.label}{/snippet}

<Part
  tag="th"
  part={weekday}
  props={{ scope: "col", ...rest, children: children ?? fallback }}
/>
