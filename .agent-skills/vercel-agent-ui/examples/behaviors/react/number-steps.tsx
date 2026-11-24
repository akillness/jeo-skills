import * as React from "react"
import {
  formatNumber,
  parseNumber,
  scrubTo,
  stepBy,
  stepFromKey,
} from "@ui-sdk/core/number"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
} from "@ui-sdk/react/field"

const range = { min: 0, max: 20, step: 0.5, largeStep: 5, smallStep: 0.1 }

function Example() {
  const [value, setValue] = React.useState(2.5)
  const [typed, setTyped] = React.useState<string | null>(null)
  const shown = formatNumber(value, "en-US", { maximumFractionDigits: 1 })
  const current = () => {
    const parsed = typed === null ? null : parseNumber(typed, "en-US")
    return parsed === null ? value : scrubTo(parsed, range).value
  }
  const commit = () => {
    setValue(current())
    setTyped(null)
  }
  return (
    <Field>
      <FieldLabel>Quantity in kg</FieldLabel>
      <FieldControl
        role="spinbutton"
        inputMode="decimal"
        autoComplete="off"
        aria-valuemin={range.min}
        aria-valuemax={range.max}
        aria-valuenow={value}
        aria-valuetext={`${shown} kg`}
        value={typed ?? shown}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            return commit()
          }
          const move = stepFromKey(event, { arrows: "vertical" })
          if (!move) {
            return
          }
          event.preventDefault()
          setValue(stepBy(current(), move, range))
          setTyped(null)
        }}
      />
      <FieldDescription>
        Arrows step by 0.5, Shift by 5 and Alt by 0.1. Home and End go to 0 and
        20.
      </FieldDescription>
    </Field>
  )
}

export { Example }
