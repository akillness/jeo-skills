// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { compileScript, parse } from "vue/compiler-sfc"
import {
  Field,
  FieldLabel,
  NumberInput,
  NumberInputControl,
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "../src"

const render = (node: () => unknown) =>
  renderToString(createSSRApp(() => node()))

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a slider and a number input", () => {
  test("a range renders placed thumbs, their inputs and one form value", async () => {
    const html = await render(() =>
      h(Slider, { name: "price", defaultValue: [20, 80] }, () => [
        h(SliderValue),
        h(SliderControl, () =>
          h(SliderTrack, () => [
            h(SliderIndicator),
            h(SliderThumb, { index: 0, "aria-label": "Minimum" }),
            h(SliderThumb, { index: 1, "aria-label": "Maximum" }),
          ])
        ),
      ])
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain("inset-inline-start:20%")
    expect(html).toMatch(
      /<input[^>]*type="range"[^>]*aria-label="Minimum"|<input[^>]*aria-label="Minimum"[^>]*type="range"/
    )
    expect(html).toMatch(/<input[^>]*name="price"[^>]*value="20\/80"/)
    expect(html).toContain("20 – 80")
  })

  test("a number input renders its formatted text and submits the number", async () => {
    const html = await render(() =>
      h(
        NumberInput,
        {
          name: "amount",
          defaultValue: 1234.5,
          locale: "en-US",
          format: { style: "currency", currency: "USD" },
        },
        () => h(NumberInputControl, { "aria-label": "Amount" })
      )
    )
    expect(html).toMatch(/<input[^>]*value="\$1,234.50"/)
    expect(html).toMatch(/<input[^>]*name="amount"[^>]*value="1234.5"/)
  })

  test("a number input rendered through #render still renders its hidden input", async () => {
    const html = await render(() =>
      h(
        NumberInput,
        { name: "amount", defaultValue: 3 },
        {
          render: ({ props }: { props: Record<string, unknown> }) =>
            h("section", props, [
              h(NumberInputControl, { "aria-label": "Amount" }),
            ]),
        }
      )
    )
    expect(html).toContain("<section")
    expect(html).toMatch(/<input[^>]*name="amount"[^>]*value="3"/)
  })

  // The range input reaches a custom thumb as `children`, and is the only thing
  // that takes focus. These tests have no SFC plugin, so the example's template
  // renders with the parts its script imports, and fails if the script binds more.
  test("the docs' render example keeps its thumb's range input", async () => {
    const file = new URL(
      "../../../examples/components/slider/vue/render.vue",
      import.meta.url
    )
    const { descriptor } = parse(readFileSync(file, "utf8"))
    const components = {
      Field,
      FieldLabel,
      Slider,
      SliderControl,
      SliderIndicator,
      SliderThumb,
      SliderTrack,
      SliderValue,
    }
    const bindings = compileScript(descriptor, { id: "render" }).bindings
    expect(Object.keys(bindings ?? {}).sort()).toEqual(
      Object.keys(components).sort()
    )
    const html = await renderToString(
      createSSRApp({ components, template: descriptor.template?.content })
    )
    const [label, labelId] = html.match(
      /<label[^>]*\sid="([^"]+)"[^>]*>.*?Brightness/
    )!
    const [input, inputId] = html.match(
      /<input[^>]*type="range"[^>]*\sid="([^"]+)"[^>]*>/
    )!
    expect(input).toContain(`aria-labelledby="${labelId}"`)
    expect(label).toContain(`for="${inputId}"`)
  })
})
