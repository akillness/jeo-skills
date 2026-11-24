<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import { Label } from "@ui-sdk/vue/label"
</script>

<template>
  <Label>
    <Checkbox>
      <CheckboxIndicator>
        <CheckIcon aria-hidden="true" />
      </CheckboxIndicator>
    </Checkbox>
    Accept terms and conditions
  </Label>
</template>
