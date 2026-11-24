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

<Calendar
  mode="range"
  minDays={3}
  maxDays={8}
  unavailable={{ from: "2026-10-17", to: "2026-10-18" }}
  allowUnavailable
>
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
