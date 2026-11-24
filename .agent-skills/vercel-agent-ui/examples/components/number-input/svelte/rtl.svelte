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
</script>

<div dir="rtl">
  <Field>
    <FieldLabel>الكمية</FieldLabel>
    <NumberInput defaultValue={1} min={0}>
      <NumberInputGroup>
        <NumberInputDecrement aria-label="إنقاص">
          <MinusIcon aria-hidden="true" />
        </NumberInputDecrement>
        <NumberInputControl />
        <NumberInputIncrement aria-label="زيادة">
          <PlusIcon aria-hidden="true" />
        </NumberInputIncrement>
      </NumberInputGroup>
    </NumberInput>
  </Field>
</div>
