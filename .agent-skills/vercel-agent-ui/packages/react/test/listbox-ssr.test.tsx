// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { Listbox, ListboxItem } from "../src/listbox"

const items = ["basil", "cheese", "onion"]

const render = (props: { defaultValue?: string[]; disabled?: boolean } = {}) =>
  renderToString(
    <Listbox multiple name="toppings" aria-label="Toppings" {...props}>
      {items.map((item) => (
        <ListboxItem key={item} value={item}>
          {item}
        </ListboxItem>
      ))}
    </Listbox>
  )

const stops = (html: string) => html.match(/tabindex="0"/g)?.length ?? 0
const stopOn = (html: string, value: string) =>
  new RegExp(
    `id="[^"]*-option-${value}"[^>]*tabindex="0"|tabindex="0"[^>]*id="[^"]*-option-${value}"`
  ).test(html)

describe("listbox on the server", () => {
  test("renders one tab stop, on the first selected option", () => {
    const html = render({ defaultValue: ["cheese", "onion"] })
    expect(stops(html)).toBe(1)
    expect(stopOn(html, "cheese")).toBe(true)
  })

  test("renders one tab stop on the first option with nothing selected", () => {
    const html = render()
    expect(stops(html)).toBe(1)
    expect(stopOn(html, "basil")).toBe(true)
  })

  test("renders a hidden input per value, so the form submits before hydration", () => {
    const html = render({ defaultValue: ["basil", "onion"] })
    expect(html.match(/type="hidden"/g)?.length).toBe(2)
  })

  test("a disabled listbox renders no tab stop", () => {
    expect(stops(render({ disabled: true }))).toBe(0)
  })
})
