// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { listbox } from "../src/components/listbox/listbox-root"
import { mount } from "../src/testing/mount"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

const markup = `<root aria-label="Letter">
  <item value="a">Alpha</item><item value="b" disabled>Beta</item><item value="c">Gamma</item><item value="d">Delta</item>
</root>`

function setup(options: Record<string, unknown> = {}) {
  const view = mount(
    listbox,
    { virtualFocus: true, activation: "manual", ...options },
    markup
  )
  mounts.push(view)
  const root = view.part("root")!
  const pointsAt = () => {
    const id = root.getAttribute("aria-activedescendant")
    return id ? document.getElementById(id)?.textContent : null
  }
  return { view, root, pointsAt }
}

test("the list is the tab stop, and its options aren't", () => {
  const { view, root } = setup()
  expect(root.getAttribute("tabindex")).toBe("0")
  expect(view.part("item", "a")!.getAttribute("tabindex")).toBe("-1")
})

test("the pointer moves the highlight, but not onto a disabled option", async () => {
  const { view, root, pointsAt } = setup({ defaultValue: "a" })
  root.focus()
  await view.settle()
  const hover = (value: string) =>
    view
      .part("item", value)!
      .dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" })
      )
  hover("b")
  expect(pointsAt()).toBe("Alpha")
  hover("c")
  expect(pointsAt()).toBe("Gamma")
})

test("keys move the highlight while focus stays on the list", async () => {
  const { view, root, pointsAt } = setup({ defaultValue: "a" })
  root.focus()
  await view.settle()
  expect(pointsAt()).toBe("Alpha")
  await view.keys("ArrowDown")
  expect(document.activeElement).toBe(root)
  expect(pointsAt()).toBe("Gamma")
  await view.keys("End")
  expect(pointsAt()).toBe("Delta")
  await view.keys("Enter")
  expect(view.api.getValue()).toBe("d")
  expect(document.activeElement).toBe(root)
})

test("leaving the list drops the highlight", async () => {
  const { view, root } = setup()
  const after = document.body.appendChild(document.createElement("button"))
  root.focus()
  await view.settle()
  expect(root.hasAttribute("aria-activedescendant")).toBe(true)
  after.focus()
  await view.settle()
  expect(root.hasAttribute("aria-activedescendant")).toBe(false)
})

test("without it, focus moves onto the options", async () => {
  const { view, root } = setup({ virtualFocus: false, defaultValue: "a" })
  expect(root.getAttribute("tabindex")).toBe("-1")
  view.part("item", "a")!.focus()
  await view.keys("ArrowDown")
  expect(document.activeElement).toBe(view.part("item", "c"))
  expect(root.hasAttribute("aria-activedescendant")).toBe(false)
})
