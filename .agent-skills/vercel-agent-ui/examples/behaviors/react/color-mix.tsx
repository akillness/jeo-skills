import * as React from "react"
import {
  formatColor,
  mixColor,
  parseColor,
  type ColorSpace,
} from "@ui-sdk/core/color"

const spaces: [ColorSpace, string][] = [
  ["oklab", "Oklab"],
  ["oklch", "OKLCH"],
  ["srgb", "sRGB"],
]

const steps = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1]

function Example() {
  const [from, setFrom] = React.useState("#2563eb")
  const [to, setTo] = React.useState("#facc15")
  const [space, setSpace] = React.useState<ColorSpace>("oklab")
  const mixes = steps.map((step) =>
    mixColor(parseColor(from)!, parseColor(to)!, step, { space })
  )
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <input
            type="color"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          From
        </label>
        <label data-slot="label">
          <input
            type="color"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          To
        </label>
        <select
          aria-label="Space"
          value={space}
          onChange={(event) => setSpace(event.target.value as ColorSpace)}
        >
          {spaces.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <ol data-slot="color-steps">
        {mixes.map((mix, index) => (
          <li
            key={index}
            title={formatColor(mix, "hex")}
            style={{ background: formatColor(mix) }}
          />
        ))}
      </ol>
    </div>
  )
}

export { Example }
