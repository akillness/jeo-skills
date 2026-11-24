// @vitest-environment jsdom
import { expect, test } from "vitest"
import { textFieldAdapter } from "../src/foundation/text/caret"

test("a committed composition reports the whole commit, as Chrome fires no input after it", () => {
  const field = document.body.appendChild(document.createElement("input"))
  field.value = "hi @"
  const adapter = textFieldAdapter(field)
  const changes: unknown[] = []
  const off = adapter.subscribe((change) => changes.push(change))
  const compose = (value: string) => {
    field.dispatchEvent(new InputEvent("beforeinput", { isComposing: true }))
    field.value = value
    field.dispatchEvent(new InputEvent("input", { isComposing: true }))
  }
  field.dispatchEvent(new CompositionEvent("compositionstart"))
  compose("hi @やまだ")
  compose("hi @山田")
  field.dispatchEvent(new CompositionEvent("compositionend"))
  expect(
    changes.filter((change) => (change as { type: string }).type === "input")
  ).toEqual([
    {
      type: "input",
      range: { start: 4, end: 4 },
      inserted: "山田",
      user: true,
    },
  ])
  off()
  field.remove()
})
