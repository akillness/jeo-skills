<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
</script>

<template>
  <div data-slot="stack" dir="rtl">
    <Field>
      <FieldLabel>الاسم على البطاقة</FieldLabel>
      <Input name="card-name" autocomplete="cc-name" placeholder="ليلى حسن" />
    </Field>
    <Field>
      <FieldLabel>رقم البطاقة</FieldLabel>
      <Input
        name="card-number"
        inputmode="numeric"
        autocomplete="cc-number"
        placeholder="1234 5678 9012 3456"
      />
      <FieldDescription>أدخل الرقم المكون من 16 خانة.</FieldDescription>
    </Field>
    <Field>
      <Checkbox name="save-card" default-checked>
        <CheckboxIndicator>
          <CheckIcon />
        </CheckboxIndicator>
      </Checkbox>
      <FieldLabel>احفظ البطاقة للمدفوعات القادمة</FieldLabel>
    </Field>
  </div>
</template>
