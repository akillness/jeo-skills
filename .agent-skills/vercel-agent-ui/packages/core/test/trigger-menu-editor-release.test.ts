// @vitest-environment jsdom
import { expect, test } from "vitest"
import { triggerMenu } from "../src/components/trigger-menu/trigger-menu"
import { release } from "../src/foundation/kernel/keep"
import { fakeEditor } from "./fake-editor"
import { kept } from "./kept"

test("a trigger menu that lets go of its editor takes its ARIA off the element", () => {
  const field = document.body.appendChild(document.createElement("textarea"))
  field.setAttribute("aria-label", "Message")
  const editor = Object.assign(fakeEditor(), { element: field })
  const instance = kept(
    triggerMenu({
      id: "menu",
      triggers: [{ char: "@", items: [{ value: "ada", label: "Ada" }] }],
      editor,
    })
  )
  editor.type("@")
  expect(field.getAttribute("aria-haspopup")).toBe("listbox")
  expect(field.hasAttribute("aria-controls")).toBe(true)
  release(instance)
  for (const name of ["aria-haspopup", "aria-autocomplete", "aria-controls"]) {
    expect(field.hasAttribute(name)).toBe(false)
  }
  expect(field.getAttribute("aria-label")).toBe("Message")
})
