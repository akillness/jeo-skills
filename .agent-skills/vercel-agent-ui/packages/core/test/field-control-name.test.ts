// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { field } from "../src/components/field/field"
import { mount, rerenderOf } from "../src/testing/mount"

const mounts: { unmount: () => void }[] = []
afterEach(() => mounts.splice(0).forEach((mounted) => mounted.unmount()))

function mountField(name: string) {
  const view = mount(
    field,
    { name },
    `<root><label>Email</label><input /></root>`
  )
  mounts.push(view)
  return view
}

const control = (view: { root: HTMLElement }) =>
  view.root.querySelector("input")!

function replaceControl(view: { root: HTMLElement }, name?: string) {
  const next = document.createElement("input")
  if (name !== undefined) {
    next.name = name
  }
  control(view).replaceWith(next)
  return next
}

test("the control the field named follows the field's new name", async () => {
  const view = mountField("email")
  await Promise.resolve()
  expect(control(view).name).toBe("email")
  rerenderOf(view).setOptions({ name: "contact" })
  expect(control(view).name).toBe("contact")
})

test("a new control that names itself what the field named the old one keeps its own name", async () => {
  const view = mountField("email")
  await Promise.resolve()
  const next = replaceControl(view, "email")
  rerenderOf(view).setOptions({ name: "contact" })
  expect(next.name).toBe("email")
})

test("a new control without a name takes the field's", async () => {
  const view = mountField("email")
  await Promise.resolve()
  const next = replaceControl(view)
  rerenderOf(view).setOptions({ name: "contact" })
  expect(next.name).toBe("contact")
})
