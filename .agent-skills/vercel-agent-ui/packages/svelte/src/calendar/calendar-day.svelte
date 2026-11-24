<!--
@component
A day. Shows the day of the month unless it has content; arrow keys move between days.
@stable
-->
<script lang="ts">
  import type { CalendarDayState } from "@ui-sdk/core/calendar"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useCalendar, useOptionalGrid } from "./context"

  let {
    value,
    children,
    ...rest
  }: PartProps<"td", CalendarDayState> & {
    /** Its ISO date. */
    value: string
  } = $props()

  const calendar = useCalendar("CalendarDay")
  const grid = useOptionalGrid()
  const day = useHandlePart(calendar, "day", () => ({
    value,
    offset: grid?.offset ?? 0,
  }))
</script>

{#snippet fallback(state: CalendarDayState)}{state.label}{/snippet}

<Part tag="td" part={day} props={{ ...rest, children: children ?? fallback }} />
