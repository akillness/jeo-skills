<script setup lang="ts">
import { addDays, endOfMonth, startOfMonth } from "@ui-sdk/core/date"
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
  createCalendarController,
} from "@ui-sdk/vue/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"

const today = "2026-10-16"
const presets = [
  { label: "Last 7 Days", range: [addDays(today, -6), today] },
  { label: "This Month", range: [startOfMonth(today), endOfMonth(today)] },
  { label: "Next 30 Days", range: [today, addDays(today, 29)] },
] as const

const calendar = createCalendarController()

function choose(range: readonly [string, string]) {
  calendar.setValue([...range])
  calendar.focus(range[0])
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button
        v-for="preset in presets"
        :key="preset.label"
        type="button"
        data-size="sm"
        @click="choose(preset.range)"
      >
        {{ preset.label }}
      </button>
    </div>
    <Calendar
      mode="range"
      :controller="calendar"
      :today="today"
      default-month="2026-10"
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
  </div>
</template>
