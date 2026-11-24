"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const speeds = [
  { value: "standard", label: "Standard", detail: "Free, 5 to 7 days" },
  { value: "express", label: "Express", detail: "$9, 2 days" },
  { value: "overnight", label: "Overnight", detail: "$24, next day" },
]

function Example() {
  const log = useLog()
  const id = React.useId()

  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Shipping speed</FieldLabel>
        <RadioGroup
          name="shipping"
          form={`${id}-checkout`}
          required
          defaultValue="standard"
        >
          {speeds.map((speed) => (
            <label data-slot="label" key={speed.value}>
              <Radio value={speed.value}>
                <RadioIndicator />
              </Radio>
              {speed.label}
              <span data-slot="hint">({speed.detail})</span>
            </label>
          ))}
        </RadioGroup>
      </Field>
      <form
        data-slot="row"
        id={`${id}-checkout`}
        onSubmit={(event) => {
          event.preventDefault()
          log(
            `Submitted shipping=${new FormData(event.currentTarget).get("shipping")}`
          )
        }}
      >
        <button type="submit" data-variant="solid">
          Continue
        </button>
        <button type="reset">Reset</button>
      </form>
    </div>
  )
}

export { Example }
