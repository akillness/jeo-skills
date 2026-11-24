import * as React from "react"
import {
  formatColor,
  isInGamut,
  parseColor,
  toGamut,
  type Color,
  type ColorFormat,
} from "@ui-sdk/core/color"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"

const formats: [ColorFormat, string][] = [
  ["hex", "Hex"],
  ["srgb", "RGB"],
  ["hsl", "HSL"],
  ["oklch", "OKLCH"],
  ["display-p3", "Display P3"],
]

function gamutOf(fitsSrgb: boolean, fitsP3: boolean) {
  if (fitsSrgb) {
    return "Every screen shows this color."
  }
  if (fitsP3) {
    return "Outside sRGB, inside P3. Hex, RGB and HSL show the closest sRGB color."
  }
  return "Outside sRGB and P3. Each format shows the closest color it holds."
}

const fitted = (color: Color, format: ColorFormat) =>
  format === "oklch"
    ? color
    : toGamut(color, format === "display-p3" ? "p3" : "srgb")

function Example() {
  const [text, setText] = React.useState("oklch(0.7 0.25 150)")
  const color = parseColor(text)
  return (
    <div data-slot="stack">
      <Field invalid={!color}>
        <FieldLabel>Color</FieldLabel>
        <div data-slot="color-field">
          <span
            data-slot="color-swatch"
            style={{ background: color ? formatColor(color) : undefined }}
          />
          <FieldControl
            value={text}
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
      </Field>
      {color ? (
        <>
          <dl data-slot="color-formats">
            {formats.map(([format, label]) => (
              <React.Fragment key={format}>
                <dt>{label}</dt>
                <dd data-format={format}>
                  {formatColor(fitted(color, format), format)}
                </dd>
              </React.Fragment>
            ))}
          </dl>
          <p data-gamut data-slot="hint">
            {gamutOf(isInGamut(color), isInGamut(color, "p3"))}
          </p>
        </>
      ) : (
        <p data-gamut data-slot="hint">
          Not a color
        </p>
      )}
    </div>
  )
}

export { Example }
