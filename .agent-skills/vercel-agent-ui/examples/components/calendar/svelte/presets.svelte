<script lang="ts">
  import { addDays, endOfMonth, startOfMonth } from "@ui-sdk/core/date"
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

  const today = "2026-10-16"
  const presets = [
    { label: "Last 7 Days", range: [addDays(today, -6), today] },
    { label: "This Month", range: [startOfMonth(today), endOfMonth(today)] },
    { label: "Next 30 Days", range: [today, addDays(today, 29)] },
  ] as const

  const calendar = createCalendarController()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    {#each presets as preset (preset.label)}
      <button
        type="button"
        data-size="sm"
        onclick={() => {
          calendar.setValue([...preset.range])
          calendar.focus(preset.range[0])
        }}
      >
        {preset.label}
      </button>
    {/each}
  </div>
  <Calendar mode="range" controller={calendar} {today} defaultMonth="2026-10">
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
