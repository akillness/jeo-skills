<script setup lang="ts">
import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
} from "@ui-sdk/vue/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { computed, ref } from "vue"

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label }))
const years = ["2024", "2025", "2026", "2027", "2028"].map((year) => ({
  value: year,
  label: year,
}))

const month = ref("2026-10")
const year = computed(() => month.value.split("-")[0])
const monthOfYear = computed(() => month.value.split("-")[1])
</script>

<template>
  <Calendar
    v-model:month="month"
    default-value="2026-10-16"
    min="2024-01-01"
    max="2028-12-31"
  >
    <div data-slot="row">
      <CalendarHeading />
      <Select
        :items="months"
        :value="monthOfYear"
        @value-change="(next) => next && (month = `${year}-${next}`)"
      >
        <SelectTrigger aria-label="Month">
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in months"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
      <Select
        :items="years"
        :value="year"
        @value-change="(next) => next && (month = `${next}-${monthOfYear}`)"
      >
        <SelectTrigger aria-label="Year">
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in years"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
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
