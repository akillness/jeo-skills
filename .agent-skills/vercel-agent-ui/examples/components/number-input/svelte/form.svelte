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
  const form = $props.id()

  function onsubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const data = [...new FormData(event.currentTarget)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(`Submitted ${data.join(", ")}`)
  }
</script>

<div data-slot="stack">
  <form data-slot="stack" id={form} {onsubmit}>
    <Field>
      <FieldLabel>Quantity</FieldLabel>
      <NumberInput name="quantity" defaultValue={2} min={1}>
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
        defaultValue={4.5}
        min={0}
        step={0.5}
        format={{ style: "currency", currency: "USD" }}
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
    <NumberInput name="gift-cards" {form} defaultValue={0} min={0}>
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
    <button type="reset" {form}>Reset</button>
    <button type="submit" {form} data-variant="solid">Save</button>
  </div>
</div>
