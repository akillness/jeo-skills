<!--
@component
The header row of weekday names, a weekday in each column. Its content can
be a snippet of the column's index that renders it, with a CalendarWeekday.
@stable
-->
<script lang="ts">
  import type { Snippet } from "svelte"
  import type { HTMLAttributes } from "svelte/elements"
  import Part from "../part.svelte"
  import { useHandlePart } from "../use-primitive.svelte"
  import CalendarWeekday from "./calendar-weekday.svelte"
  import { useCalendar, useCalendarGrid } from "./context"

  let {
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLTableSectionElement>, "children"> & {
    /** Renders a column's header from its index, from 0, with a CalendarWeekday. */
    children?: Snippet<[number]>
  } = $props()

  const grid = useCalendarGrid("CalendarWeekdays")
  const row = useHandlePart(
    useCalendar("CalendarWeekdays"),
    "weekdays",
    () => ({ id: String(grid.offset) })
  )
</script>

{#snippet cells()}
  {#each grid.state.weekdays as weekday, index (weekday)}
    {#if children}
      {@render children(index)}
    {:else}
      <CalendarWeekday {index} />
    {/if}
  {/each}
{/snippet}

<thead {...rest}>
  <Part tag="tr" part={row} props={{ children: cells }} />
</thead>
