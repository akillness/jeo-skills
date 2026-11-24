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
    type CalendarValue,
  } from "@ui-sdk/svelte/calendar"
  import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/svelte"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let value = $state<CalendarValue>("2026-10-16")
  let month = $state("2026-10")
</script>

<div>
  <Calendar
    bind:value
    bind:month
    onValueChange={(next, details) =>
      log(`Selected ${String(next)} (${details.reason})`)}
    onMonthChange={(next, details) =>
      log(`Showing ${next} (${details.reason})`)}
  >
    <div data-slot="row">
      <CalendarPrevious data-variant="ghost">
        <ChevronLeftIcon />
      </CalendarPrevious>
      <CalendarHeading />
      <CalendarNext data-variant="ghost">
        <ChevronRightIcon />
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
</div>
