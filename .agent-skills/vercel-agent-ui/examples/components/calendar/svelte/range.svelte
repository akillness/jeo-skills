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
  months={2}
  monthFormat="short"
  defaultValue={["2026-10-12", "2026-10-16"]}
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
  <div data-slot="row">
    <CalendarGrid offset={0}>
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
    <CalendarGrid offset={1}>
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
  </div>
</Calendar>
