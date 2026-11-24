<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"

const tasks = [
  { label: "Write the release notes", done: false },
  { label: "Update the changelog", done: true },
  { label: "Tag the release", done: false },
]
</script>

<template>
  <div data-slot="stack">
    <label data-slot="label" v-for="task in tasks" :key="task.label">
      <Checkbox :default-checked="task.done">
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      {{ task.label }}
    </label>
  </div>
</template>
