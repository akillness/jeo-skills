<script setup lang="ts">
import { DateInput } from "@ui-sdk/vue/date-input"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const value = ref<string | null>("2026-11-02")
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="value = null">Clear</button>
    </div>
    <Field>
      <FieldLabel>Due date</FieldLabel>
      <DateInput
        v-model:value="value"
        @value-change="(next) => log(`Due date ${next ?? 'empty'}`)"
      />
    </Field>
  </div>
</template>
