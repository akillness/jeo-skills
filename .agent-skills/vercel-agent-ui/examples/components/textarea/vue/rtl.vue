<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Textarea } from "@ui-sdk/vue/textarea"
</script>

<template>
  <Field dir="rtl" name="feedback">
    <FieldLabel>ملاحظاتك</FieldLabel>
    <Textarea auto-resize placeholder="أخبرنا برأيك…" />
    <FieldDescription>نقرأ كل رسالة.</FieldDescription>
  </Field>
</template>
