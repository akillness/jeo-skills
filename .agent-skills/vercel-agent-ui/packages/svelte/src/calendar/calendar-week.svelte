<script lang="ts">
  import type { CalendarGridCell } from "@ui-sdk/core/calendar"
  import type { Snippet } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart } from "../use-primitive.svelte"
  import CalendarDay from "./calendar-day.svelte"
  import { useCalendar, useCalendarGrid } from "./context"

  // A week's row, for CalendarWeeks, which renders one per week.
  let {
    week,
    index,
    day,
  }: {
    week: CalendarGridCell[]
    index: number
    day?: Snippet<[CalendarGridCell]>
  } = $props()

  const grid = useCalendarGrid("CalendarWeeks")
  const row = useHandlePart(useCalendar("CalendarWeeks"), "week", () => ({
    id: `${grid.offset}-${index}`,
  }))
</script>

{#snippet cells()}
  {#each week as cell (cell.date)}
    {#if cell.hidden}
      <td></td>
    {:else if day}
      {@render day(cell)}
    {:else}
      <CalendarDay value={cell.date} />
    {/if}
  {/each}
{/snippet}

<Part tag="tr" part={row} props={{ children: cells }} />
