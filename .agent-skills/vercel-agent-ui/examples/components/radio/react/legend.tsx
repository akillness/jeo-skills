"use client"

import { FieldDescription, FieldLegend, FieldSet } from "@ui-sdk/react/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"
import * as React from "react"

const periods = [
  { value: "monthly", label: "Monthly", price: "$12 per month" },
  { value: "yearly", label: "Yearly", price: "$120 per year" },
]

function Example() {
  const id = React.useId()
  return (
    <FieldSet>
      <FieldLegend id={`${id}-legend`}>Billing period</FieldLegend>
      <FieldDescription id={`${id}-description`}>
        Yearly billing gets you two months free.
      </FieldDescription>
      <RadioGroup
        defaultValue="monthly"
        aria-labelledby={`${id}-legend`}
        aria-describedby={`${id}-description`}
      >
        {periods.map((period) => (
          <label data-slot="label" key={period.value}>
            <Radio value={period.value}>
              <RadioIndicator />
            </Radio>
            {period.label}
            <span data-slot="hint">({period.price})</span>
          </label>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}

export { Example }
