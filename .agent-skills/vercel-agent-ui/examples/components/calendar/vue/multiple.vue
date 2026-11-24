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
  type CalendarValue,
} from "@ui-sdk/vue/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
import { ref } from "vue"

const dates = ref<string[]>(["2026-10-07", "2026-10-16", "2026-10-26"])

function onValueChange(value: CalendarValue) {
  dates.value = value as string[]
}
</script>

<template>
  <div>
    <Calendar mode="multiple" :value="dates" @update:value="onValueChange">
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
    </Calendar>
  </div>
</template>
