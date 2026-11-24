import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  createRadioGroupController,
  Radio,
  RadioGroup,
  RadioIndicator,
} from "@ui-sdk/solid/radio"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

type Plan = "starter" | "pro" | "team"

const plans: { value: Plan; label: string }[] = [
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
]

function Example() {
  const log = useLog()
  const planGroup = createRadioGroupController<Plan>()
  const [value, setValue] = createSignal<Plan | null>("pro")

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
          value={value()}
          onValueChange={(next, details) => {
            setValue(next)
            log(
              `${plans.find((plan) => plan.value === next)?.label ?? "None"} (${details.reason})`
            )
          }}
          controller={planGroup}
        >
          <For each={plans}>
            {(plan) => (
              <label data-slot="label">
                <Radio value={plan.value}>
                  <RadioIndicator />
                </Radio>
                {plan.label}
              </label>
            )}
          </For>
        </RadioGroup>
      </Field>
    </div>
  )
}

export { Example }
