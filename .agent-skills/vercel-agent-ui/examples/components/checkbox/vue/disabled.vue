<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
</script>

<template>
  <div data-slot="stack">
    <label data-slot="label">
      <Checkbox default-checked>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Product updates
    </label>
    <label data-slot="label">
      <Checkbox default-checked disabled>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Security alerts
    </label>
  </div>
</template>
