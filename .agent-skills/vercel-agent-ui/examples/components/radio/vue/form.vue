<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"
import { useId } from "vue"
import { useLog } from "../../../shared/vue/log"

const speeds = [
  { value: "standard", label: "Standard", detail: "Free, 5 to 7 days" },
  { value: "express", label: "Express", detail: "$9, 2 days" },
  { value: "overnight", label: "Overnight", detail: "$24, next day" },
]

const log = useLog()
const id = useId()

function submit(event: Event) {
  log(
    `Submitted shipping=${new FormData(event.currentTarget as HTMLFormElement).get("shipping")}`
  )
}
</script>

<template>
  <div data-slot="stack">
    <Field>
      <FieldLabel>Shipping speed</FieldLabel>
      <RadioGroup
        name="shipping"
        :form="`${id}-checkout`"
        required
        default-value="standard"
      >
        <label v-for="speed in speeds" :key="speed.value" data-slot="label">
          <Radio :value="speed.value">
            <RadioIndicator />
          </Radio>
          {{ speed.label }}
          <span data-slot="hint">({{ speed.detail }})</span>
        </label>
      </RadioGroup>
    </Field>
    <form :id="`${id}-checkout`" data-slot="row" @submit.prevent="submit">
      <button type="submit" data-variant="solid">Continue</button>
      <button type="reset">Reset</button>
    </form>
  </div>
</template>
