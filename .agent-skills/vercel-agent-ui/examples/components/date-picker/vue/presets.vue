<script setup lang="ts">
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
  DatePickerPreset,
  DatePickerTrigger,
} from "@ui-sdk/vue/date-picker"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
</script>

<template>
  <DatePicker mode="range" today="2026-10-16">
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
        <CalendarWeekdays v-slot="{ index }">
          <CalendarWeekday :index="index" />
        </CalendarWeekdays>
        <CalendarWeeks v-slot="{ cell }">
          <CalendarDay :value="cell.date" />
        </CalendarWeeks>
      </CalendarGrid>
      <div data-slot="row">
        <DatePickerPreset
          data-variant="ghost"
          :value="['2026-10-10', '2026-10-16']"
        >
          Last 7 Days
        </DatePickerPreset>
        <DatePickerPreset
          data-variant="ghost"
          :value="['2026-09-17', '2026-10-16']"
        >
          Last 30 Days
        </DatePickerPreset>
        <DatePickerPreset
          data-variant="ghost"
          :value="['2026-10-01', '2026-10-31']"
        >
          This Month
        </DatePickerPreset>
      </div>
    </DatePickerContent>
  </DatePicker>
</template>
