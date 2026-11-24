// @vitest-environment jsdom
// Chrome's autofill sends a field a keydown with no key, which bubbles through
// every part around the field. None may throw.
import "./after-mount"
import { afterEach, expect, test } from "vitest"
import type { Primitive } from "../src/foundation/kernel/primitive-types"
import { mount } from "../src/testing/mount"
import { cases } from "./after-mount.cases"

let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  unmount = undefined
})

const openings = [
  { state: "as it starts", options: {} },
  { state: "open", options: { defaultOpen: true } },
]

test.each(
  cases.flatMap((entry) =>
    openings.map((opening) => ({ ...entry, ...opening, start: entry.options }))
  )
)("$name, $state: a keydown with no key throws nothing", async (entry) => {
  const mounted = mount(
    entry.primitive as Primitive,
    { ...entry.start, ...entry.options },
    entry.markup
  )
  unmount = mounted.unmount
  await mounted.settle()
  const errors: string[] = []
  const onError = (event: ErrorEvent) => {
    event.preventDefault()
    errors.push(String(event.error))
  }
  window.addEventListener("error", onError)
  for (const el of document.querySelectorAll("[data-slot]")) {
    // Autofill never fills editable text.
    if (el.closest("[contenteditable]")) {
      continue
    }
    for (const type of ["keydown", "keyup"]) {
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
    }
  }
  window.removeEventListener("error", onError)
  expect(errors).toEqual([])
})
