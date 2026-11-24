<script setup lang="ts">
import { createDateInputController, DateInput } from "@ui-sdk/vue/date-input"
import { Field, FieldLabel } from "@ui-sdk/vue/field"

const publish = createDateInputController()
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="publish.setValue('2026-12-25')">
        Christmas
      </button>
      <button type="button" @click="publish.focus('year')">Edit Year</button>
      <button type="button" @click="publish.clear()">Clear</button>
    </div>
    <Field>
      <FieldLabel>Publish on</FieldLabel>
      <DateInput :controller="publish" />
    </Field>
  </div>
</template>
