"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/react/number-input"
import { MinusIcon, PlusIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const form = React.useId()

  return (
    <div data-slot="stack">
      <form
        data-slot="stack"
        id={form}
        onSubmit={(event) => {
          event.preventDefault()
          const data = [...new FormData(event.currentTarget)].map(
            ([name, value]) => `${name}=${value}`
          )
          log(`Submitted ${data.join(", ")}`)
        }}
      >
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
        <NumberInput name="gift-cards" form={form} defaultValue={0} min={0}>
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
        <button type="reset" form={form}>
          Reset
        </button>
        <button type="submit" form={form} data-variant="solid">
          Save
        </button>
      </div>
    </div>
  )
}

export { Example }
