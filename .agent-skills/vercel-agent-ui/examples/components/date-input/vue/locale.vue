<script setup lang="ts">
import { DateInput } from "@ui-sdk/vue/date-input"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
</script>

<template>
  <div data-slot="stack">
    <Field>
      <FieldLabel>Date (en-GB)</FieldLabel>
      <DateInput locale="en-GB" default-value="2026-11-02" />
    </Field>
    <Field>
      <FieldLabel>Datum (de-DE)</FieldLabel>
      <DateInput locale="de-DE" default-value="2026-11-02" />
    </Field>
    <Field>
      <FieldLabel>日付 (ja-JP)</FieldLabel>
      <DateInput locale="ja-JP" default-value="2026-11-02" />
    </Field>
  </div>
</template>
