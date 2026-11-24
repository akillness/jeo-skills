<script setup lang="ts">
import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarMonthSelect,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  CalendarYearSelect,
} from "@ui-sdk/vue/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
</script>

<template>
  <Calendar default-month="1990-06" min="1920-01-01" max="2026-10-16">
    <div data-slot="row">
      <CalendarPrevious data-variant="ghost">
        <ChevronLeftIcon aria-hidden="true" />
      </CalendarPrevious>
      <CalendarHeading />
      <div data-slot="row">
        <CalendarMonthSelect />
        <CalendarYearSelect />
      </div>
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
