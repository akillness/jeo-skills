// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { NumberInput, NumberInputControl } from "../src/number-input"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "../src/slider"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a slider and a number input", () => {
  test("a range renders placed thumbs, their inputs and one form value", () => {
    const html = renderToString(
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
    )
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

  test("a number input renders its formatted text and submits the number", () => {
    const html = renderToString(
      <NumberInput
        name="amount"
        defaultValue={1234.5}
        locale="en-US"
        format={{ style: "currency", currency: "USD" }}
      >
        <NumberInputControl aria-label="Amount" />
      </NumberInput>
    )
    expect(html).toMatch(/<input[^>]*value="\$1,234.50"/)
    expect(html).toMatch(
      /<input(?=[^>]*type="hidden")(?=[^>]*name="amount")(?=[^>]*value="1234.5")/
    )
  })
})
