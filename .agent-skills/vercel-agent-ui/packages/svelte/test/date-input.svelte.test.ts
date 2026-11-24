import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test, vi } from "vitest"
import App from "./apps/date-input-app.svelte"

let app: ReturnType<typeof mount> | undefined

afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  document.body.replaceChildren()
})

function render(props: Record<string, unknown>) {
  app = mount(App, { target: document.body, props: props as never })
  flushSync()
}

const segment = (type: string) =>
  document.querySelector<HTMLInputElement>(`input[data-type="${type}"]`)!

function type(text: string) {
  for (const char of text) {
    document.activeElement!.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "insertText",
        data: char,
        bubbles: true,
        cancelable: true,
      })
    )
    flushSync()
  }
}

test("typing over a date reports each segment it completes", () => {
  const onValueChange = vi.fn()
  render({ which: "date", onValueChange })
  const month = segment("month")
  month.focus()
  type("12252027")
  expect(onValueChange.mock.calls.map(([value]) => value)).toEqual([
    "2026-12-02",
    "2026-12-25",
    "2027-12-25",
  ])
  expect([
    segment("month").value,
    segment("day").value,
    segment("year").value,
  ]).toEqual(["12", "25", "2027"])
  expect(segment("month")).toBe(month)
  expect(
    document.querySelector<HTMLInputElement>('input[type="hidden"]')!.value
  ).toBe("2027-12-25")
})

test("a bound value follows the input", () => {
  render({ which: "time" })
  segment("minute").focus()
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    })
  )
  flushSync()
  expect(document.querySelector("output")!.textContent).toBe("09:31")
  expect(segment("minute").value).toBe("31")
})

test("a field's label names the group and focuses its first segment", () => {
  render({ which: "field" })
  const group = document.querySelector('[role="group"]')!
  const label = document.querySelector("label")!
  expect(group.getAttribute("aria-labelledby")).toContain(label.id)
  label.click()
  flushSync()
  expect(document.activeElement).toBe(segment("month"))
})

test("children can render the segments themselves", () => {
  render({ which: "children" })
  expect(document.querySelector(".segment-month")).toBe(segment("month"))
  expect(document.querySelector(".segment-literal")!.textContent).toBe("/")
})

test("the native readonly attribute keeps the date as it is", () => {
  render({ which: "readonly" })
  segment("day").focus()
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    })
  )
  flushSync()
  expect(segment("day").value).toBe("02")
})
