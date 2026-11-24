import { render } from "@solidjs/web"
import { createSignal, flush, For } from "solid-js"
import { afterEach, expect, test, vi } from "vitest"
import { DateInput, DateInputSegment } from "../src/date-input"
import { Field, FieldLabel } from "../src/field"
import { TimeInput } from "../src/time-input"

let dispose = () => {}

function mount(code: () => any) {
  const root = document.createElement("div")
  document.body.append(root)
  dispose = render(code, root)
  flush()
  return root
}

afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const segment = (root: HTMLElement, type: string) =>
  root.querySelector<HTMLInputElement>(`input[data-type="${type}"]`)!

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
    flush()
  }
}

test("typing a date fills the segments and reports the ISO value once", () => {
  const onValueChange = vi.fn()
  const root = mount(() => (
    <DateInput locale="en-US" onValueChange={onValueChange} />
  ))
  const month = segment(root, "month")
  month.focus()
  type("11042026")
  expect(onValueChange.mock.calls.map(([value]) => value)).toEqual([
    "2026-11-04",
  ])
  expect([
    segment(root, "month").value,
    segment(root, "day").value,
    segment(root, "year").value,
  ]).toEqual(["11", "04", "2026"])
  expect(segment(root, "month")).toBe(month)
  expect(
    root.querySelector<HTMLInputElement>('input[type="hidden"]')!.value
  ).toBe("2026-11-04")
})

test("a controlled value follows its owner", () => {
  const [value, setValue] = createSignal<string | null>("09:30")
  const root = mount(() => (
    <>
      <TimeInput
        value={value()}
        onValueChange={setValue}
        hourCycle={24}
        locale="en-US"
      />
      <output>{value()}</output>
    </>
  ))
  segment(root, "minute").focus()
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    })
  )
  flush()
  expect(root.querySelector("output")!.textContent).toBe("09:31")
  expect(segment(root, "minute").value).toBe("31")
})

test("a field's label names the group and focuses its first segment", () => {
  const root = mount(() => (
    <Field>
      <FieldLabel>Start date</FieldLabel>
      <DateInput locale="en-US" />
    </Field>
  ))
  const group = root.querySelector('[role="group"]')!
  const label = root.querySelector("label")!
  expect(group.getAttribute("aria-labelledby")).toContain(label.id)
  label.click()
  flush()
  expect(document.activeElement).toBe(segment(root, "month"))
})

test("children can render the segments themselves", () => {
  const root = mount(() => (
    <DateInput defaultValue="2026-11-02" locale="en-US">
      {(state) => (
        <For each={state.segments} keyed={(item) => item.key}>
          {(item) => (
            <DateInputSegment
              segment={item()}
              class={`segment-${item().type}`}
            />
          )}
        </For>
      )}
    </DateInput>
  ))
  expect(root.querySelector(".segment-month")).toBe(segment(root, "month"))
  expect(root.querySelector(".segment-literal")!.textContent).toBe("/")
})
