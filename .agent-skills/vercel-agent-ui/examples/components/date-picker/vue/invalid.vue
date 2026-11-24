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
  DatePickerHint,
  DatePickerInput,
  DatePickerTrigger,
} from "@ui-sdk/vue/date-picker"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
</script>

<template>
  <DatePicker default-value="2026-10-16">
    <div data-slot="row">
      <DatePickerInput aria-label="Due date" />
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
    </DatePickerContent>
    <DatePickerHint v-slot="{ state: hint }">
      Like {{ hint.example }}
    </DatePickerHint>
  </DatePicker>
</template>
