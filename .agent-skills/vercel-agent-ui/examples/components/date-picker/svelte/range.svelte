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
  } from "@ui-sdk/svelte/date-picker"
  import {
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
  } from "@lucide/svelte"

  let field: HTMLElement | undefined = $state()
</script>

<DatePicker
  mode="range"
  months={2}
  monthFormat="short"
  defaultValue={["2026-10-12", "2026-10-16"]}
>
  <div data-slot="row" bind:this={field}>
    <DatePickerInput aria-label="Check in" placeholder="Check in" />
    <span data-slot="hint">–</span>
    <DatePickerInput end aria-label="Check out" placeholder="Check out" />
    <DatePickerTrigger data-variant="ghost">
      <CalendarIcon aria-hidden="true" />
    </DatePickerTrigger>
  </div>
  <DatePickerContent anchor={field} align="center">
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
  </DatePickerContent>
</DatePicker>
