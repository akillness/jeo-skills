import { Label } from "@ui-sdk/react/label"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"

const speeds = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]

function Example() {
  return (
    <div data-slot="stack">
      <Label htmlFor="shipping-speed">Shipping speed</Label>
      <RadioGroup id="shipping-speed" defaultValue="standard">
        {speeds.map((speed) => (
          <Label key={speed.value}>
            <Radio value={speed.value}>
              <RadioIndicator />
            </Radio>
            {speed.label}
          </Label>
        ))}
      </RadioGroup>
    </div>
  )
}

export { Example }
