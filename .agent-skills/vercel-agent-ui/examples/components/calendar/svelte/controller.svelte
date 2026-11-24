<script lang="ts">
  import { todayDate } from "@ui-sdk/core/date"
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
    createCalendarController,
  } from "@ui-sdk/svelte/calendar"
  import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/svelte"

  const calendar = createCalendarController()

  function select(date: string) {
    calendar.setValue(date)
    calendar.focus(date)
  }
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => select("2026-12-25")}
      >Go to Christmas</button
    >
    <button type="button" onclick={() => select(todayDate())}>Today</button>
  </div>
  <Calendar
    controller={calendar}
    defaultValue="2026-10-16"
    defaultMonth="2026-10"
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
</div>
