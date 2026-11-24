<!--
@component
One month's grid, a table. `offset` picks which of the months shown, from 0.
Without content it renders its weekdays and weeks.
@stable
-->
<script lang="ts">
  import type { CalendarGridState } from "@ui-sdk/core/calendar"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import CalendarWeekdays from "./calendar-weekdays.svelte"
  import CalendarWeeks from "./calendar-weeks.svelte"
  import {
    CalendarGridKey,
    useCalendar,
    type CalendarGridContext,
  } from "./context"

  let {
    offset = 0,
    children,
    ...rest
  }: PartProps<"table", CalendarGridState> & {
    /** Which of the months shown it is, from 0. */
    offset?: number
  } = $props()

  const grid = useHandlePart(useCalendar("CalendarGrid"), "grid", () => ({
    offset,
    id: String(offset),
  }))
  const context: CalendarGridContext = {
    get offset() {
      return offset
    },
    get state() {
      return grid.state
    },
  }
  setContext(CalendarGridKey, context)
</script>

{#snippet fallback()}
  <CalendarWeekdays />
  <CalendarWeeks />
{/snippet}

<Part
  tag="table"
  part={grid}
  props={{ ...rest, children: children ?? fallback }}
/>
