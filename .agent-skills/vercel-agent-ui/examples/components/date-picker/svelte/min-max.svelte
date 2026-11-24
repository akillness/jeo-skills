<script lang="ts">
  import {
    CalendarDay,
    CalendarGrid,
    CalendarHeading,
    CalendarNext,
    CalendarPrevious,
    CalendarWeekday,
    CalendarWeekdays,
    CalendarWeeks,
    DatePicker,
    DatePickerContent,
    DatePickerHint,
    DatePickerInput,
    DatePickerTrigger,
  } from "@ui-sdk/svelte/date-picker"
  import {
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
  } from "@lucide/svelte"
</script>

<DatePicker
  min="2026-10-05"
  max="2026-11-20"
  unavailable={[{ weekday: [0, 6] }]}
  defaultValue="2026-10-16"
>
  <div data-slot="row">
    <DatePickerInput aria-label="Delivery date" />
    <DatePickerTrigger data-variant="ghost">
      <CalendarIcon aria-hidden="true" />
    </DatePickerTrigger>
  </div>
  <DatePickerHint />
  <DatePickerContent>
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
  </DatePickerContent>
</DatePicker>
