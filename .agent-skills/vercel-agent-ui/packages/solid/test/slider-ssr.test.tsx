import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import { Field, FieldLabel } from "../src/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "../src/slider"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a slider", () => {
  test("a range renders placed thumbs, their inputs and one form value", () => {
    const html = renderToString(() => (
      <Slider name="price" defaultValue={[20, 80]}>
        <SliderValue />
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb index={0} aria-label="Minimum" />
            <SliderThumb index={1} aria-label="Maximum" />
          </SliderTrack>
        </SliderControl>
      </Slider>
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toContain("inset-inline-start:20%")
    expect(html).toMatch(
      /<input(?=[^>]*type="range")(?=[^>]*aria-label="Minimum")/
    )
    expect(html).toMatch(
      /<input(?=[^>]*type="hidden")(?=[^>]*name="price")(?=[^>]*value="20\/80")/
    )
    expect(html).toContain("20 – 80")
  })

  test("the thumb's input comes after the thumb's own content", () => {
    const html = renderToString(() => (
      <Slider defaultValue={40}>
        <SliderControl>
          <SliderTrack>
            <SliderThumb aria-label="Volume">
              {(state) => <span class="label">{state.thumbValue}</span>}
            </SliderThumb>
          </SliderTrack>
        </SliderControl>
      </Slider>
    ))
    expect(html).toMatch(
      /<span class="label">40<\/span><input[^>]*type="range"/
    )
  })

  test("a single thumb in a field is the field's control, which carries the field's validity", () => {
    const html = renderToString(() => (
      <Field invalid>
        <FieldLabel>Volume</FieldLabel>
        <Slider name="volume" defaultValue={50}>
          <SliderControl>
            <SliderTrack>
              <SliderThumb />
            </SliderTrack>
          </SliderControl>
        </Slider>
      </Field>
    ))
    expect(html).toMatch(
      /<input(?=[^>]*type="range")(?=[^>]*aria-invalid="true")/
    )
    expect(html).toMatch(
      /<input(?=[^>]*type="range")(?=[^>]*data-slot="slider-thumb-input")/
    )
  })
})
