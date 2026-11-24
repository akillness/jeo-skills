<script lang="ts">
  import {
    Calendar,
    CalendarDay,
    CalendarGrid,
    CalendarHeading,
    CalendarNext,
    CalendarPrevious,
    CalendarWeekday,
  } from "@ui-sdk/svelte/calendar"
  import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/svelte"

  function isoWeek(date: string) {
    const day = new Date(`${date}T00:00:00Z`)
    day.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7))
    const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4))
    const days = (day.getTime() - firstThursday.getTime()) / 86400000
    return (
      1 + Math.round((days - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
    )
  }
</script>

<Calendar defaultValue="2026-10-16" weekStartsOn={1}>
  <div data-slot="row">
    <CalendarPrevious data-variant="ghost">
      {#snippet render({ props, state: step })}
        <button {...props} title={`Show ${step.month}`}>
          <ChevronLeftIcon />
        </button>
      {/snippet}
    </CalendarPrevious>
    <CalendarHeading>
      {#snippet children(heading)}{heading.label}{/snippet}
    </CalendarHeading>
    <CalendarNext data-variant="ghost">
      <ChevronRightIcon />
    </CalendarNext>
  </div>
  <CalendarGrid>
    {#snippet children(grid)}
      <thead>
        <tr>
          <th scope="col">
            <abbr title="Week">Wk</abbr>
          </th>
          {#each grid.weekdays as weekday, index (weekday)}
            <CalendarWeekday {index} />
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each grid.weeks as week (week[0]!.date)}
          <tr>
            <th scope="row" data-slot="hint">{isoWeek(week[0]!.date)}</th>
            {#each week as cell (cell.date)}
              {#if cell.hidden}
                <td></td>
              {:else}
                <CalendarDay value={cell.date} />
              {/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    {/snippet}
  </CalendarGrid>
</Calendar>
