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
const priceOf = (date: string) => 80 + ((Number(date.slice(8)) * 7) % 5) * 10
</script>

<template>
  <Calendar today="2026-10-16" default-value="2026-10-16">
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
        <CalendarWeekday v-slot="{ state }" :index="index">
          <abbr
            :title="state.name"
            :data-weekend="
              state.weekday === 0 || state.weekday === 6 || undefined
            "
          >
            {{ state.label }}
          </abbr>
        </CalendarWeekday>
      </CalendarWeekdays>
      <CalendarWeeks v-slot="{ cell }">
        <CalendarDay v-slot="{ state }" :value="cell.date">
          <span data-slot="stack">
            <span>{{ state.label }}</span>
            <span v-if="!state.outside && !state.disabled" data-slot="hint"
              >${{ priceOf(state.date) }}</span
            >
          </span>
        </CalendarDay>
      </CalendarWeeks>
    </CalendarGrid>
  </Calendar>
</template>
