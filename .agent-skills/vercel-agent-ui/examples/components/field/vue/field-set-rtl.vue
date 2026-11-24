<script setup lang="ts">
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
</script>

<template>
  <FieldSet dir="rtl">
    <FieldLegend>العنوان</FieldLegend>
    <FieldDescription>نحتاج عنوانك لتوصيل طلبك.</FieldDescription>
    <Field name="street">
      <FieldLabel>الشارع</FieldLabel>
      <Input />
    </Field>
    <Field name="city">
      <FieldLabel>المدينة</FieldLabel>
      <Input />
    </Field>
  </FieldSet>
</template>
