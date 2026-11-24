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
    DatePickerInput,
    DatePickerTrigger,
    type DatePickerValue,
  } from "@ui-sdk/svelte/date-picker"
  import {
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
  } from "@lucide/svelte"

  let value = $state<DatePickerValue>(null)
  let asking = $state(false)
</script>

<DatePicker
  bind:value
  mode="range"
  defaultMonth="2026-10"
  dismissible={value !== null}
  onValueChange={() => (asking = false)}
  onOpenChange={(open) => open && (asking = false)}
  onDismissAttempt={() => (asking = true)}
>
  <div data-slot="row">
    <DatePickerInput aria-label="Check in" placeholder="Check in" />
    <span data-slot="hint">–</span>
    <DatePickerInput end aria-label="Check out" placeholder="Check out" />
    <DatePickerTrigger data-variant="ghost">
      <CalendarIcon aria-hidden="true" />
    </DatePickerTrigger>
  </div>
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
    {#if asking}
      <p data-slot="hint" role="alert">
        Pick a check-out date to finish your stay.
      </p>
    {/if}
  </DatePickerContent>
</DatePicker>
