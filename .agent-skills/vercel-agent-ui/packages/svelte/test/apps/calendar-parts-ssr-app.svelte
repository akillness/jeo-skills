<script lang="ts">
  import {
    Calendar,
    CalendarDay,
    CalendarGrid,
    CalendarWeekday,
    CalendarWeekdays,
    CalendarWeeks,
  } from "../../src/calendar"
</script>

<Calendar defaultMonth="2026-10" showOutsideDays={false}>
  <CalendarGrid>
    <CalendarWeekdays>
      {#snippet children(index)}
        <CalendarWeekday {index} class="weekday" />
      {/snippet}
    </CalendarWeekdays>
    <CalendarWeeks>
      {#snippet children(cell)}
        <CalendarDay value={cell.date} class="day">
          {#snippet children(state)}day {state.label}{/snippet}
        </CalendarDay>
      {/snippet}
    </CalendarWeeks>
  </CalendarGrid>
</Calendar>
