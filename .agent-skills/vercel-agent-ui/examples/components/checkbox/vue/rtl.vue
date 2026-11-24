<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
</script>

<template>
  <div data-slot="stack" dir="rtl">
    <label data-slot="label">
      <Checkbox>
        <CheckboxIndicator>
          <CheckIcon />
        </CheckboxIndicator>
      </Checkbox>
      قبول الشروط والأحكام
    </label>
    <label data-slot="label">
      <Checkbox default-checked>
        <CheckboxIndicator>
          <CheckIcon />
        </CheckboxIndicator>
      </Checkbox>
      تفعيل الإشعارات
    </label>
  </div>
</template>
