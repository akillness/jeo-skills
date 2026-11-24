import * as React from "react"
import { contrastRatio, parseColor } from "@ui-sdk/core/color"

function verdictOf(ratio: number) {
  if (ratio >= 4.5) {
    return "Passes for all text"
  }
  if (ratio >= 3) {
    return "Passes for large text only"
  }
  return "Fails for text"
}

function Example() {
  const [text, setText] = React.useState("#8a8a8a")
  const [background, setBackground] = React.useState("#ffffff")
  const ratio = contrastRatio(parseColor(text)!, parseColor(background)!)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <input
            type="color"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          Text
        </label>
        <label data-slot="label">
          <input
            type="color"
            value={background}
            onChange={(event) => setBackground(event.target.value)}
          />
          Background
        </label>
      </div>
      <p data-slot="contrast-preview" style={{ color: text, background }}>
        Your order ships tomorrow.
      </p>
      <p data-ratio data-slot="hint">
        {ratio.toFixed(2)}:1, {verdictOf(ratio)}
      </p>
    </div>
  )
}

export { Example }
