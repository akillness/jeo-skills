<script lang="ts">
  import {
    Calendar,
    CalendarDay,
    CalendarGrid,
    CalendarHeading,
    CalendarNext,
    CalendarPrevious,
    CalendarWeekday,
    CalendarWeekdays,
    CalendarWeeks,
  } from "@ui-sdk/svelte/calendar"
  import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/svelte"
</script>

<Calendar disabled defaultValue="2026-10-16">
  <div data-slot="row">
    <CalendarPrevious data-variant="ghost">
      <ChevronLeftIcon aria-hidden="true" />
    </CalendarPrevious>
    <CalendarHeading />
    <CalendarNext data-variant="ghost">
      <ChevronRightIcon aria-hidden="true" />
    </CalendarNext>
  </div>
  <CalendarGrid>
    <CalendarWeekdays>
      {#snippet children(index)}
        <CalendarWeekday {index} />
      {/snippet}
    </CalendarWeekdays>
    <CalendarWeeks>
      {#snippet children(cell)}
        <CalendarDay value={cell.date} />
      {/snippet}
    </CalendarWeeks>
  </CalendarGrid>
</Calendar>
