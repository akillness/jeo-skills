<script lang="ts">
  import {
    Calendar,
    CalendarDay,
    CalendarGrid,
    CalendarHeading,
    CalendarWeekday,
    CalendarWeekdays,
    CalendarWeeks,
  } from "@ui-sdk/svelte/calendar"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ].map((label, index) => ({
    value: String(index + 1).padStart(2, "0"),
    label,
  }))
  const years = ["2024", "2025", "2026", "2027", "2028"].map((year) => ({
    value: year,
    label: year,
  }))

  let month = $state("2026-10")
  const [year, monthOfYear] = $derived(month.split("-"))
</script>

<Calendar
  bind:month
  defaultValue="2026-10-16"
  min="2024-01-01"
  max="2028-12-31"
>
  <div data-slot="row">
    <CalendarHeading />
    <Select
      items={months}
      value={monthOfYear}
      onValueChange={(next) => next && (month = `${year}-${next}`)}
    >
      <SelectTrigger aria-label="Month">
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each months as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <Select
      items={years}
      value={year}
      onValueChange={(next) => next && (month = `${next}-${monthOfYear}`)}
    >
      <SelectTrigger aria-label="Year">
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each years as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
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
