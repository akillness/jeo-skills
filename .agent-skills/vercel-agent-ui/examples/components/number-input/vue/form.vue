<script setup lang="ts">
import { MinusIcon, PlusIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/vue/number-input"
import { useId } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const form = useId()

function onSubmit(event: Event) {
  const data = [...new FormData(event.currentTarget as HTMLFormElement)].map(
    ([name, value]) => `${name}=${value}`
  )
  log(`Submitted ${data.join(", ")}`)
}
</script>

<template>
  <div data-slot="stack">
    <form :id="form" data-slot="stack" @submit.prevent="onSubmit">
      <Field>
        <FieldLabel>Quantity</FieldLabel>
        <NumberInput name="quantity" :default-value="2" :min="1">
          <NumberInputGroup>
            <NumberInputDecrement aria-label="Decrease">
              <MinusIcon aria-hidden="true" />
            </NumberInputDecrement>
            <NumberInputControl />
            <NumberInputIncrement aria-label="Increase">
              <PlusIcon aria-hidden="true" />
            </NumberInputIncrement>
          </NumberInputGroup>
        </NumberInput>
      </Field>
      <Field>
        <FieldLabel>Tip</FieldLabel>
        <NumberInput
          name="tip"
          :default-value="4.5"
          :min="0"
          :step="0.5"
          :format="{ style: 'currency', currency: 'USD' }"
        >
          <NumberInputGroup>
            <NumberInputDecrement aria-label="Decrease">
              <MinusIcon aria-hidden="true" />
            </NumberInputDecrement>
            <NumberInputControl />
            <NumberInputIncrement aria-label="Increase">
              <PlusIcon aria-hidden="true" />
            </NumberInputIncrement>
          </NumberInputGroup>
        </NumberInput>
      </Field>
    </form>
    <Field>
      <FieldLabel>Gift cards</FieldLabel>
      <NumberInput name="gift-cards" :form="form" :default-value="0" :min="0">
        <NumberInputGroup>
          <NumberInputDecrement aria-label="Decrease">
            <MinusIcon aria-hidden="true" />
          </NumberInputDecrement>
          <NumberInputControl />
          <NumberInputIncrement aria-label="Increase">
            <PlusIcon aria-hidden="true" />
          </NumberInputIncrement>
        </NumberInputGroup>
      </NumberInput>
    </Field>
    <div data-slot="row">
      <button type="reset" :form="form">Reset</button>
      <button type="submit" :form="form" data-variant="solid">Save</button>
    </div>
  </div>
</template>
