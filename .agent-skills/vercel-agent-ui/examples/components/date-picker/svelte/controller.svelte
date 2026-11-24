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
    createDatePickerController,
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

  const controller = createDatePickerController()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => controller.setValue("2026-12-25")}
      >Choose Christmas</button
    >
    <button type="button" onclick={() => controller.open()}>Open</button>
  </div>
  <DatePicker {controller} defaultValue="2026-10-16">
    <div data-slot="row">
      <DatePickerInput aria-label="Due date" />
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
</div>
