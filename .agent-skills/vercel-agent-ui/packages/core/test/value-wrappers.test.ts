// @vitest-environment jsdom
import { expect, test } from "vitest"
import { watchValue } from "../src/foundation/forms/value"

const native = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)!

// A layer that wraps an element's `value` once, as a testing library does.
function wrapOnce(el: HTMLInputElement, seen: string[]) {
  const inner = Object.getOwnPropertyDescriptor(el, "value") ?? native
  Object.defineProperty(el, "value", {
    configurable: true,
    get() {
      return inner.get!.call(this)
    },
    set(value: string) {
      seen.push(value)
      inner.set!.call(this, value)
    },
  })
}

test("a value wrapper added after binding stays through unbinding and binding again", () => {
  const el = document.createElement("input")
  const seen: string[] = []
  const heard: string[] = []
  const stop = watchValue(el, () => {})
  wrapOnce(el, seen)
  stop()
  watchValue(el, (source) => heard.push(source))
  el.value = "x"
  expect(seen).toEqual(["x"])
  expect(heard).toEqual(["write"])
  expect(el.value).toBe("x")
})

test("binding again wraps anew once a later layer took its wrapper off with ours", () => {
  const el = document.createElement("input")
  const heard: string[] = []
  const stop = watchValue(el, () => {})
  wrapOnce(el, [])
  stop()
  delete (el as { value?: string }).value
  watchValue(el, (source) => heard.push(source))
  el.value = "x"
  expect(heard).toEqual(["write"])
})

test("unbinding with nothing wrapped after puts the element's own value back", () => {
  const el = document.createElement("input")
  watchValue(el, () => {})()
  expect(Object.getOwnPropertyDescriptor(el, "value")).toBeUndefined()
})
