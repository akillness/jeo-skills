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
  type DatePickerMonthChangeReason,
  type DatePickerOpenChangeReason,
} from "@ui-sdk/vue/date-picker"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const anchor = ref<HTMLElement | null>(null)
const container = ref<HTMLElement | null>(null)

function onOpenChange(
  open: boolean,
  details: { reason: DatePickerOpenChangeReason }
) {
  log(`${open ? "Opened" : "Closed"} (${details.reason})`)
}

function onOpenChangeComplete(open: boolean) {
  if (!open) {
    log("Finished closing")
  }
}

function onMonthChange(
  month: string,
  details: { reason: DatePickerMonthChangeReason }
) {
  log(`Showing ${month} (${details.reason})`)
}
</script>

<template>
  <div data-slot="stack">
    <DatePicker
      :default-open="false"
      presentation="auto"
      :container="container"
      @open-change="onOpenChange"
      @open-change-complete="onOpenChangeComplete"
      @month-change="onMonthChange"
    >
      <div ref="anchor" data-slot="row">
        <DatePickerInput aria-label="Due date" />
        <DatePickerTrigger data-variant="ghost">
          <CalendarIcon aria-hidden="true" />
        </DatePickerTrigger>
      </div>
      <DatePickerHint />
      <DatePickerContent
        :anchor="anchor"
        :side-offset="6"
        :collision-padding="16"
        keep-mounted
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
      </DatePickerContent>
    </DatePicker>
    <div ref="container" />
  </div>
</template>
