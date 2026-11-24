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
  DatePickerTrigger,
  type DatePickerValue,
} from "@ui-sdk/vue/date-picker"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
import { ref } from "vue"

const value = ref<DatePickerValue>(null)
const asking = ref(false)
</script>

<template>
  <DatePicker
    v-model:value="value"
    mode="range"
    default-month="2026-10"
    :dismissible="value !== null"
    @value-change="asking = false"
    @open-change="(open: boolean) => open && (asking = false)"
    @dismiss-attempt="asking = true"
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
        <CalendarWeekdays v-slot="{ index }">
          <CalendarWeekday :index="index" />
        </CalendarWeekdays>
        <CalendarWeeks v-slot="{ cell }">
          <CalendarDay :value="cell.date" />
        </CalendarWeeks>
      </CalendarGrid>
      <p v-if="asking" data-slot="hint" role="alert">
        Pick a check-out date to finish your stay.
      </p>
    </DatePickerContent>
  </DatePicker>
</template>
