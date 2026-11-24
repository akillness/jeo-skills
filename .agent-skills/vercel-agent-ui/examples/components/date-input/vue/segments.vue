<script setup lang="ts">
import { DateInput, DateInputSegment } from "@ui-sdk/vue/date-input"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
</script>

<template>
  <Field>
    <FieldLabel>Start date</FieldLabel>
    <DateInput v-slot="{ state }" default-value="2026-11-02">
      <template v-for="segment in state.segments" :key="segment.key">
        <DateInputSegment v-if="segment.editable" :segment="segment" />
        <DateInputSegment v-else :segment="segment">–</DateInputSegment>
      </template>
    </DateInput>
  </Field>
</template>
