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
} from "@ui-sdk/vue/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
</script>

<template>
  <Calendar
    mode="range"
    :min-days="3"
    :max-days="8"
    :unavailable="{ from: '2026-10-17', to: '2026-10-18' }"
    allow-unavailable
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
      <CalendarWeekdays v-slot="{ index }">
        <CalendarWeekday :index="index" />
      </CalendarWeekdays>
      <CalendarWeeks v-slot="{ cell }">
        <CalendarDay :value="cell.date" />
      </CalendarWeeks>
    </CalendarGrid>
  </Calendar>
</template>
