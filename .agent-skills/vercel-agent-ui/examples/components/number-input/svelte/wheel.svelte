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
  <FieldLabel>Font size</FieldLabel>
  <NumberInput defaultValue={16} min={8} max={72} wheel>
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
  <FieldDescription>Focus the input, then scroll over it.</FieldDescription>
</Field>
