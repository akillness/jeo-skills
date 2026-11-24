<script lang="ts">
  import { MinusIcon, PlusIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    NumberInput,
    NumberInputControl,
    NumberInputDecrement,
    NumberInputGroup,
    NumberInputIncrement,
  } from "@ui-sdk/svelte/number-input"

  const fields = [
    {
      label: "Price",
      defaultValue: 19.99,
      step: 0.01,
      format: { style: "currency", currency: "USD" },
    },
    {
      label: "Discount",
      defaultValue: 0.15,
      step: 0.01,
      format: { style: "percent" },
    },
    {
      label: "Weight",
      defaultValue: 2.5,
      step: 0.1,
      format: { style: "unit", unit: "kilogram" },
    },
  ] satisfies {
    label: string
    defaultValue: number
    step: number
    format: Intl.NumberFormatOptions
  }[]
</script>

<div data-slot="stack">
  {#each fields as field (field.label)}
    <Field>
      <FieldLabel>{field.label}</FieldLabel>
      <NumberInput
        defaultValue={field.defaultValue}
        step={field.step}
        format={field.format}
        min={0}
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
  {/each}
</div>
