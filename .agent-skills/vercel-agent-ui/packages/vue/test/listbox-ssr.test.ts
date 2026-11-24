// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { Listbox, ListboxItem } from "../src"

const items = ["basil", "cheese", "onion"]

const render = (props: { defaultValue?: string[]; disabled?: boolean } = {}) =>
  renderToString(
    createSSRApp(() =>
      h(
        Listbox,
        {
          multiple: true,
          name: "toppings",
          "aria-label": "Toppings",
          ...props,
        },
        () =>
          items.map((item) =>
            h(ListboxItem, { key: item, value: item }, () => item)
          )
      )
    )
  )

const stops = (html: string) => html.match(/tabindex="0"/g)?.length ?? 0
const stopOn = (html: string, value: string) =>
  new RegExp(
    `id="[^"]*-option-${value}"[^>]*tabindex="0"|tabindex="0"[^>]*id="[^"]*-option-${value}"`
  ).test(html)

describe("listbox on the server", () => {
  test("renders one tab stop, on the first selected option", async () => {
    const html = await render({ defaultValue: ["cheese", "onion"] })
    expect(stops(html)).toBe(1)
    expect(stopOn(html, "cheese")).toBe(true)
  })

  test("renders one tab stop on the first option with nothing selected", async () => {
    const html = await render()
    expect(stops(html)).toBe(1)
    expect(stopOn(html, "basil")).toBe(true)
  })

  test("renders a hidden input per value, so the form submits before hydration", async () => {
    const html = await render({ defaultValue: ["basil", "onion"] })
    expect(html.match(/type="hidden"/g)?.length).toBe(2)
  })

  test("a disabled listbox renders no tab stop", async () => {
    expect(stops(await render({ disabled: true }))).toBe(0)
  })
})
