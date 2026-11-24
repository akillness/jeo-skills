import { FieldDescription, FieldLegend, FieldSet } from "@ui-sdk/solid/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { createUniqueId, For } from "solid-js"

const periods = [
  { value: "monthly", label: "Monthly", price: "$12 per month" },
  { value: "yearly", label: "Yearly", price: "$120 per year" },
]

function Example() {
  const id = createUniqueId()
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
        <For each={periods}>
          {(period) => (
            <label data-slot="label">
              <Radio value={period.value}>
                <RadioIndicator />
              </Radio>
              {period.label}
              <span data-slot="hint">({period.price})</span>
            </label>
          )}
        </For>
      </RadioGroup>
    </FieldSet>
  )
}

export { Example }
