<!--
@component
The weeks of the grid's month, a row each, with a day in each cell. Its
content can be a snippet of a cell that renders its day, with a
CalendarDay. A cell that shows nothing stays an empty cell.
@stable
-->
<script lang="ts">
  import type { CalendarGridCell } from "@ui-sdk/core/calendar"
  import type { Snippet } from "svelte"
  import type { HTMLAttributes } from "svelte/elements"
  import CalendarWeek from "./calendar-week.svelte"
  import { useCalendarGrid } from "./context"

  let {
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLTableSectionElement>, "children"> & {
    /** Renders a cell's day from the cell, with a CalendarDay whose `value` is `cell.date`. */
    children?: Snippet<[CalendarGridCell]>
  } = $props()

  const grid = useCalendarGrid("CalendarWeeks")
</script>

<tbody {...rest}>
  {#each grid.state.weeks as week, index (week[0]!.date)}
    <CalendarWeek {week} {index} day={children} />
  {/each}
</tbody>
