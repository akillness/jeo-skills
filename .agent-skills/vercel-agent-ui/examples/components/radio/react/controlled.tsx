"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  createRadioGroupController,
  Radio,
  RadioGroup,
  RadioIndicator,
} from "@ui-sdk/react/radio"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

type Plan = "starter" | "pro" | "team"

const plans: { value: Plan; label: string }[] = [
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
]

function Example() {
  const log = useLog()
  const [planGroup] = React.useState(() => createRadioGroupController<Plan>())
  const [value, setValue] = React.useState<Plan | null>("pro")

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => planGroup.setValue("team")}>
          Choose Team
        </button>
      </div>
      <Field>
        <FieldLabel>Plan</FieldLabel>
        <RadioGroup
          value={value}
          onValueChange={(next, details) => {
            setValue(next)
            log(
              `${plans.find((plan) => plan.value === next)?.label ?? "None"} (${details.reason})`
            )
          }}
          controller={planGroup}
        >
          {plans.map((plan) => (
            <label data-slot="label" key={plan.value}>
              <Radio value={plan.value}>
                <RadioIndicator />
              </Radio>
              {plan.label}
            </label>
          ))}
        </RadioGroup>
      </Field>
    </div>
  )
}

export { Example }
