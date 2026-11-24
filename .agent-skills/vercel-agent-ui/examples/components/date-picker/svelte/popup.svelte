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
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let anchor: HTMLElement | undefined = $state()
  let container: HTMLElement | undefined = $state()
</script>

<div data-slot="stack">
  <DatePicker
    defaultOpen={false}
    presentation="auto"
    {container}
    onOpenChange={(open, details) =>
      log(`${open ? "Opened" : "Closed"} (${details.reason})`)}
    onOpenChangeComplete={(open) => open || log("Finished closing")}
    onMonthChange={(month, details) =>
      log(`Showing ${month} (${details.reason})`)}
  >
    <div data-slot="row" bind:this={anchor}>
      <DatePickerInput aria-label="Due date" />
      <DatePickerTrigger data-variant="ghost">
        <CalendarIcon aria-hidden="true" />
      </DatePickerTrigger>
    </div>
    <DatePickerHint />
    <DatePickerContent
      {anchor}
      sideOffset={6}
      collisionPadding={16}
      keepMounted
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
    </DatePickerContent>
  </DatePicker>
  <div bind:this={container}></div>
</div>
