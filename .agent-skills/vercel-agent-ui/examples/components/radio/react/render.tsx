"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Radio, RadioGroup } from "@ui-sdk/react/radio"
import { CheckIcon } from "lucide-react"
import * as React from "react"

const options = [
  {
    value: "all",
    label: "Everything",
    description: "Every message and update.",
  },
  {
    value: "mentions",
    label: "Mentions",
    description: "Only when someone mentions you.",
  },
  { value: "none", label: "Nothing", description: "Turn notifications off." },
]

function Example() {
  const id = React.useId()
  return (
    <Field>
      <FieldLabel>Notify me about</FieldLabel>
      <RadioGroup defaultValue="mentions">
        {options.map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            aria-labelledby={`${id}-${option.value}-label`}
            aria-describedby={`${id}-${option.value}-description`}
            render={(props, state) => (
              <button {...props}>
                <span data-slot="stack">
                  <span id={`${id}-${option.value}-label`}>{option.label}</span>
                  <span
                    data-slot="hint"
                    id={`${id}-${option.value}-description`}
                  >
                    {option.description}
                  </span>
                </span>
                <CheckIcon
                  aria-hidden="true"
                  data-checked={state.checked ? "" : undefined}
                />
              </button>
            )}
          />
        ))}
      </RadioGroup>
    </Field>
  )
}

export { Example }
