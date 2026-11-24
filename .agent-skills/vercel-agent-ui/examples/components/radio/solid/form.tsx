import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { createUniqueId, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const speeds = [
  { value: "standard", label: "Standard", detail: "Free, 5 to 7 days" },
  { value: "express", label: "Express", detail: "$9, 2 days" },
  { value: "overnight", label: "Overnight", detail: "$24, next day" },
]

function Example() {
  const log = useLog()
  const id = createUniqueId()

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
          <For each={speeds}>
            {(speed) => (
              <label data-slot="label">
                <Radio value={speed.value}>
                  <RadioIndicator />
                </Radio>
                {speed.label}
                <span data-slot="hint">({speed.detail})</span>
              </label>
            )}
          </For>
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
