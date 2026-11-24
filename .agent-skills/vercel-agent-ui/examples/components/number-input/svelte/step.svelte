<script lang="ts">
  import { MinusIcon, PlusIcon } from "@lucide/svelte"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    NumberInput,
    NumberInputControl,
    NumberInputDecrement,
    NumberInputGroup,
    NumberInputIncrement,
  } from "@ui-sdk/svelte/number-input"
</script>

<Field>
  <FieldLabel>Hours</FieldLabel>
  <NumberInput
    defaultValue={1.5}
    min={0}
    max={24}
    step={0.25}
    largeStep={1}
    smallStep={0.05}
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
  <FieldDescription>Logged in quarter hours.</FieldDescription>
</Field>
