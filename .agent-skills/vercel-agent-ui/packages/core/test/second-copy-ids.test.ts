// @vitest-environment jsdom
import { expect, test, vi } from "vitest"

test("a second copy of core names its anchors apart from the first's", async () => {
  const first = await import("../src/foundation/platform/anchoring")
  vi.resetModules()
  const second = await import("../src/foundation/platform/anchoring")
  expect(second.nameAnchor).not.toBe(first.nameAnchor)
  const a = document.body.appendChild(document.createElement("button"))
  const b = document.body.appendChild(document.createElement("button"))
  expect(first.nameAnchor(a)).not.toBe(second.nameAnchor(b))
})

test("a second copy of core gives its labels ids apart from the first's", async () => {
  const label = () => {
    const el = document.body.appendChild(document.createElement("label"))
    const control = document.body.appendChild(document.createElement("div"))
    return { el, control }
  }
  const first = await import("../src/foundation/forms/form")
  vi.resetModules()
  const second = await import("../src/foundation/forms/form")
  expect(second.labelledBy).not.toBe(first.labelledBy)
  const a = label()
  const b = label()
  first.labelledBy(a.control, () => [a.el])
  second.labelledBy(b.control, () => [b.el])
  await Promise.resolve()
  expect(a.el.id).toBeTruthy()
  expect(a.el.id).not.toBe(b.el.id)
})
