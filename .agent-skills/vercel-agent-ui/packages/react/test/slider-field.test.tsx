// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Field, FieldLabel } from "../src/field"
import { Slider, SliderControl, SliderThumb, SliderTrack } from "../src/slider"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  document.body.innerHTML = ""
})

function Price({ value }: { value: number | number[] }) {
  const thumbs = Array.isArray(value) ? value : [value]
  return (
    <Field>
      <FieldLabel>Price</FieldLabel>
      <Slider value={value}>
        <SliderControl>
          <SliderTrack>
            {thumbs.map((_, index) => (
              <SliderThumb key={index} index={index} />
            ))}
          </SliderTrack>
        </SliderControl>
      </Slider>
    </Field>
  )
}

test.each([
  ["a range", "one thumb", [20, 80], 30],
  ["one thumb", "a range", 30, [20, 80]],
])(
  "a slider in a field switched from %s to %s points its label at an input or nowhere",
  async (_from, _to, before, after) => {
    const container = document.body.appendChild(document.createElement("div"))
    root = createRoot(container)
    await React.act(async () => root!.render(<Price value={before} />))
    await React.act(async () => root!.render(<Price value={after} />))
    await React.act(
      async () => new Promise((resolve) => setTimeout(resolve, 20))
    )
    const target = container
      .querySelector('[data-slot="field-label"]')!
      .getAttribute("for")
    if (target !== null) {
      expect(document.getElementById(target)?.tagName).toBe("INPUT")
    }
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  }
)
