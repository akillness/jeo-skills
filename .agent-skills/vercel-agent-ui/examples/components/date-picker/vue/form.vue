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
} from "@ui-sdk/vue/date-picker"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/vue/field"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function submit(event: Event) {
  log(
    `Submitted due=${new FormData(event.currentTarget as HTMLFormElement).get("due")}`
  )
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="submit">
    <Field name="due">
      <FieldLabel>Due date</FieldLabel>
      <DatePicker required>
        <div data-slot="row">
          <DatePickerInput />
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
        </DatePickerContent>
      </DatePicker>
      <FieldDescription>When the invoice is due.</FieldDescription>
      <div>
        <FieldError match="valueMissing">Choose a due date.</FieldError>
      </div>
    </Field>
    <button type="submit">Submit</button>
  </form>
</template>
