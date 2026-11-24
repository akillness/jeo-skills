// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import type { OptionsOf } from "../src/foundation/kernel/primitive-types"
import { mount } from "../src/testing"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

function view(options: OptionsOf<typeof combobox>) {
  const mounted = mount(
    combobox,
    options,
    `<root><input><content><list></list></content></root>`
  )
  mounts.push(mounted)
  ;(mounted.part("input") as HTMLElement).focus()
  return mounted
}

function stealFocus() {
  const thief = document.body.appendChild(document.createElement("button"))
  thief.focus()
}

test("focus moved elsewhere by code closes the list with focus-out", async () => {
  const reasons: string[] = []
  const combo = view({
    items: ["Backlog", "Done"],
    onOpenChange: (_open, details) => reasons.push(details.reason),
  })
  await combo.keys("ArrowDown")
  expect(combo.state.open).toBe(true)
  stealFocus()
  expect(combo.state.open).toBe(false)
  expect(reasons.at(-1)).toBe("focus-out")
})

test("canceling a focus-out close keeps the list open", async () => {
  const combo = view({
    items: ["Backlog", "Done"],
    onOpenChange: (open, details) => {
      if (!open && details.reason === "focus-out") {
        details.cancel()
      }
    },
  })
  await combo.keys("ArrowDown")
  stealFocus()
  expect(combo.state.open).toBe(true)
})
