<script setup lang="ts">
import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  type CalendarMonthChangeReason,
  type CalendarValue,
  type CalendarValueChangeReason,
} from "@ui-sdk/vue/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const value = ref<CalendarValue>("2026-10-16")
const month = ref("2026-10")
const log = useLog()

function onValueChange(
  next: CalendarValue,
  details: { reason: CalendarValueChangeReason }
) {
  log(`Selected ${String(next)} (${details.reason})`)
}

function onMonthChange(
  next: string,
  details: { reason: CalendarMonthChangeReason }
) {
  log(`Showing ${next} (${details.reason})`)
}
</script>

<template>
  <div>
    <Calendar
      v-model:value="value"
      v-model:month="month"
      @value-change="onValueChange"
      @month-change="onMonthChange"
    >
      <div data-slot="row">
        <CalendarPrevious data-variant="ghost">
          <ChevronLeftIcon />
        </CalendarPrevious>
        <CalendarHeading />
        <CalendarNext data-variant="ghost">
          <ChevronRightIcon />
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
    </Calendar>
  </div>
</template>
