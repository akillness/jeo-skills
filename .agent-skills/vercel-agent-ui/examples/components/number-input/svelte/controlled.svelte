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
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let value = $state<number | null>(4)
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => (value = 4)}>Reset to 4</button>
    <button type="button" onclick={() => (value = null)}>Clear</button>
  </div>
  <Field>
    <FieldLabel>Servings</FieldLabel>
    <NumberInput
      bind:value
      onValueChange={(next, details) =>
        log(`Value ${next ?? "empty"} (${details.reason})`)}
      onValueCommit={(next, details) =>
        log(`Committed ${next ?? "empty"} (${details.reason})`)}
      min={1}
      max={12}
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
</div>
