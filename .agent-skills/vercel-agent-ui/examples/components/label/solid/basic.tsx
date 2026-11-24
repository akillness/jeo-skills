import { Label } from "@ui-sdk/solid/label"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { For } from "solid-js"

const speeds = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]

function Example() {
  return (
    <div data-slot="stack">
      <Label for="shipping-speed">Shipping speed</Label>
      <RadioGroup id="shipping-speed" defaultValue="standard">
        <For each={speeds}>
          {(speed) => (
            <Label>
              <Radio value={speed.value}>
                <RadioIndicator />
              </Radio>
              {speed.label}
            </Label>
          )}
        </For>
      </RadioGroup>
    </div>
  )
}

export { Example }
