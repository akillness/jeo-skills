// A control in a Field keeps the id its author gives it, and the field's
// label and the control's own parts point at that id once they bind.
import { flushSync, mount, unmount, type ComponentProps } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/field-author-id-app.svelte"

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let app: ReturnType<typeof mount> | undefined

async function mountField(kind: ComponentProps<typeof App>["kind"]) {
  app = mount(App, { target: document.body, props: { kind } })
  flushSync()
  await new Promise((resolve) => setTimeout(resolve, 20))
  flushSync()
}

afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  document.body.replaceChildren()
})

test("a number input's control keeps the id passed to it, and its label and step buttons point at it", async () => {
  await mountField("number-input")
  expect(document.getElementById("mine")?.localName).toBe("input")
  expect(document.querySelector("label")?.htmlFor).toBe("mine")
  const buttons = [...document.querySelectorAll("button")]
  expect(buttons.map((button) => button.getAttribute("aria-controls"))).toEqual(
    ["mine", "mine"]
  )
})

test.each([
  "file-input",
  "checkbox",
  "switch",
  "radio-group",
  "checkbox-group",
  "rating",
  "segmented-control",
  "color-picker",
  "range-slider",
] as const)(
  "a %s in a field keeps the id passed to it, and the field's label names it",
  async (kind) => {
    await mountField(kind)
    const control = document.getElementById("mine")
    const label = document.querySelector("label")!
    expect(control).not.toBeNull()
    const named =
      label.htmlFor === "mine" ||
      !!control?.getAttribute("aria-labelledby")?.split(" ").includes(label.id)
    expect(named).toBe(true)
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id)
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
  }
)
