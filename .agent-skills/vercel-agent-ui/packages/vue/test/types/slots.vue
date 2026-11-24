<script setup lang="ts">
// Parts written by hand type their slots' state, like `createParts` parts.
import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarNext,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
} from "../../src/calendar"
import { Field, FieldDescription, FieldSet } from "../../src/field"
import { Select, SelectValue } from "../../src/select"
import { Toggle } from "../../src/toggle"
</script>

<template>
  <Field>
    <FieldDescription v-slot="{ state }">{{
      state.invalid ? "Check this" : ""
    }}</FieldDescription>
  </Field>
  <FieldSet>
    <FieldDescription v-slot="{ state }">
      <!-- @vue-expect-error A field set's description has no field state, so `invalid` may be undefined. -->
      {{ state.invalid.valueOf() }}
    </FieldDescription>
  </FieldSet>
  <Toggle v-slot="{ state }">{{ state.pressed ? "On" : "Off" }}</Toggle>
  <Toggle v-slot="{ state }">
    <!-- @vue-expect-error Toggle's state has no `nonexistent`. -->
    {{ state.nonexistent }}
  </Toggle>
  <Select>
    <SelectValue v-slot="{ state }">{{ state.placeholder }}</SelectValue>
    <SelectValue v-slot="{ state }">
      <!-- @vue-expect-error SelectValue's state has no `nonexistent`. -->
      {{ state.nonexistent }}
    </SelectValue>
  </Select>
  <Calendar>
    <CalendarNext v-slot="{ state }">{{
      state.disabled ? "" : "›"
    }}</CalendarNext>
    <CalendarNext v-slot="{ state }">
      <!-- @vue-expect-error CalendarNext's state has no `nonexistent`. -->
      {{ state.nonexistent }}
    </CalendarNext>
    <CalendarGrid>
      <CalendarWeekdays v-slot="{ index }"
        ><CalendarWeekday :index="index"
      /></CalendarWeekdays>
      <CalendarWeeks v-slot="{ cell }"
        ><CalendarDay :value="cell.date"
      /></CalendarWeeks>
      <CalendarWeeks v-slot="{ cell }">
        <!-- @vue-expect-error A week's cell has no `nonexistent`. -->
        {{ cell.nonexistent }}
      </CalendarWeeks>
    </CalendarGrid>
  </Calendar>
</template>
