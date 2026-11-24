<script lang="ts">
  import { MinusIcon, PlusIcon } from "@lucide/svelte"
  import {
    NumberInput,
    NumberInputControl,
    NumberInputDecrement,
    NumberInputGroup,
    NumberInputIncrement,
  } from "@ui-sdk/svelte/number-input"
</script>

<NumberInput defaultValue={1} min={0}>
  <NumberInputGroup>
    <NumberInputDecrement aria-label="Decrease">
      <MinusIcon aria-hidden="true" />
    </NumberInputDecrement>
    <NumberInputControl aria-label="Quantity" />
    <NumberInputIncrement aria-label="Increase">
      <PlusIcon aria-hidden="true" />
    </NumberInputIncrement>
  </NumberInputGroup>
</NumberInput>
