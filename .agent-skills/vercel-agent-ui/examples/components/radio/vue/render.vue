<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Radio, RadioGroup } from "@ui-sdk/vue/radio"
import { useId } from "vue"

const options = [
  {
    value: "all",
    label: "Everything",
    description: "Every message and update.",
  },
  {
    value: "mentions",
    label: "Mentions",
    description: "Only when someone mentions you.",
  },
  { value: "none", label: "Nothing", description: "Turn notifications off." },
]

const id = useId()
</script>

<template>
  <Field>
    <FieldLabel>Notify me about</FieldLabel>
    <RadioGroup default-value="mentions">
      <Radio
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :aria-labelledby="`${id}-${option.value}-label`"
        :aria-describedby="`${id}-${option.value}-description`"
      >
        <template #render="{ props, state }">
          <button v-bind="props">
            <span data-slot="stack">
              <span :id="`${id}-${option.value}-label`">{{
                option.label
              }}</span>
              <span
                :id="`${id}-${option.value}-description`"
                data-slot="hint"
                >{{ option.description }}</span
              >
            </span>
            <CheckIcon
              aria-hidden="true"
              :data-checked="state.checked ? '' : undefined"
            />
          </button>
        </template>
      </Radio>
    </RadioGroup>
  </Field>
</template>
