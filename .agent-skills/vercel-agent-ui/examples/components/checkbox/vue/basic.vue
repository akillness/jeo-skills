<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
</script>

<template>
  <label data-slot="label">
    <Checkbox>
      <CheckboxIndicator>
        <CheckIcon aria-hidden="true" />
      </CheckboxIndicator>
    </Checkbox>
    Accept terms and conditions
  </label>
</template>
