<script setup lang="ts">
import { CheckIcon, PlusIcon } from "@lucide/vue"
import { Checkbox } from "@ui-sdk/vue/checkbox"

const topics = [
  { value: "design", label: "Design", checked: true },
  { value: "engineering", label: "Engineering", checked: false },
  { value: "marketing", label: "Marketing", checked: false },
  { value: "sales", label: "Sales", checked: false },
]
</script>

<template>
  <fieldset>
    <legend>Topics you follow</legend>
    <div data-slot="row">
      <Checkbox
        v-for="topic in topics"
        :key="topic.value"
        name="topics"
        :value="topic.value"
        :default-checked="topic.checked"
      >
        <template #render="{ props, state }">
          <button v-bind="props">
            <CheckIcon v-if="state.checked" />
            <PlusIcon v-else />
            {{ topic.label }}
          </button>
        </template>
      </Checkbox>
    </div>
  </fieldset>
</template>
