<script setup lang="ts">
import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
} from "@ui-sdk/vue/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"

function isoWeek(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4))
  const days = (day.getTime() - firstThursday.getTime()) / 86400000
  return 1 + Math.round((days - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}
</script>

<template>
  <Calendar default-value="2026-10-16" :week-starts-on="1">
    <div data-slot="row">
      <CalendarPrevious data-variant="ghost">
        <template #render="{ props, state: step }">
          <button v-bind="props" :title="`Show ${step.month}`">
            <ChevronLeftIcon />
          </button>
        </template>
      </CalendarPrevious>
      <CalendarHeading v-slot="{ state: heading }">{{
        heading.label
      }}</CalendarHeading>
      <CalendarNext data-variant="ghost">
        <ChevronRightIcon />
      </CalendarNext>
    </div>
    <CalendarGrid v-slot="{ state: grid }">
      <thead>
        <tr>
          <th scope="col">
            <abbr title="Week">Wk</abbr>
          </th>
          <CalendarWeekday
            v-for="(weekday, index) in grid.weekdays"
            :key="weekday"
            :index="index"
          />
        </tr>
      </thead>
      <tbody>
        <tr v-for="week in grid.weeks" :key="week[0]!.date">
          <th scope="row" data-slot="hint">{{ isoWeek(week[0]!.date) }}</th>
          <template v-for="cell in week" :key="cell.date">
            <td v-if="cell.hidden"></td>
            <CalendarDay v-else :value="cell.date" />
          </template>
        </tr>
      </tbody>
    </CalendarGrid>
  </Calendar>
</template>
