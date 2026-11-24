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
    DatePickerClear,
    DatePickerContent,
    DatePickerHint,
    DatePickerInput,
    DatePickerTrigger,
  } from "@ui-sdk/svelte/date-picker"
  import {
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    XIcon,
  } from "@lucide/svelte"
</script>

<DatePicker defaultValue="2026-10-16">
  <div data-slot="row">
    <DatePickerInput aria-label="Due date" />
    <DatePickerClear data-variant="ghost" aria-label="Clear date">
      <XIcon aria-hidden="true" />
    </DatePickerClear>
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
