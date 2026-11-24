<script lang="ts">
  import { MinusIcon, PlusIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    createNumberInputController,
    NumberInput,
    NumberInputControl,
    NumberInputDecrement,
    NumberInputGroup,
    NumberInputIncrement,
  } from "@ui-sdk/svelte/number-input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const zoom = createNumberInputController()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => zoom.decrement({ large: true })}
      >Zoom Out</button
    >
    <button type="button" onclick={() => zoom.increment({ large: true })}
      >Zoom In</button
    >
    <button type="button" onclick={() => zoom.setValue(100)}>Actual Size</button
    >
    <button type="button" onclick={() => log(`Zoom is ${zoom.getValue()}%`)}
      >Read</button
    >
    <button type="button" onclick={() => zoom.focus()}>Focus</button>
  </div>
  <Field>
    <FieldLabel>Zoom</FieldLabel>
    <NumberInput
      defaultValue={100}
      min={10}
      max={400}
      step={10}
      format={{ style: "unit", unit: "percent" }}
      controller={zoom}
      onValueChange={(value, details) =>
        log(`Zoom ${value ?? "empty"}% (${details.reason})`)}
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
