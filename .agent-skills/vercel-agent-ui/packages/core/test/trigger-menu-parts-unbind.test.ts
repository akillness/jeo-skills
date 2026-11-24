// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { triggerMenu } from "../src/components/trigger-menu/trigger-menu"
import { bind } from "../src/foundation/kernel/part"
import { fakeEditor } from "./fake-editor"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
})

Element.prototype.getAnimations ??= () => []

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup() {
  const editor = fakeEditor()
  const instance = triggerMenu({
    id: "menu",
    triggers: [{ char: "@" }, { char: "/" }],
    editor,
  })
  const content = document.body.appendChild(document.createElement("div"))
  const list = content.appendChild(document.createElement("div"))
  cleanups.push(
    bind(instance.part("content"), content),
    bind(instance.part("list"), list),
    () => instance.destroy(),
    () => content.remove()
  )
  const part = (slot: "empty" | "item", props?: Record<string, unknown>) => {
    const el = list.appendChild(document.createElement("div"))
    const unbind = bind(instance.part(slot, props), el)
    return () => {
      unbind()
      el.remove()
    }
  }
  const open = () => (instance.get() as { open: boolean }).open
  return { editor, part, open }
}

test("an empty part that unmounts stops holding the menu open", async () => {
  const { editor, part, open } = setup()
  const removeEmpty = part("empty")
  await tick()
  editor.type("@zzz")
  await tick()
  expect(open()).toBe(true)
  removeEmpty()
  await tick()
  expect(open()).toBe(false)
  editor.type(" /nomatch")
  await tick()
  expect(open()).toBe(false)
})

test("the menu closes when its last row unmounts", async () => {
  const { editor, part, open } = setup()
  const removeRow = part("item", { value: "alice", label: "Alice" })
  await tick()
  editor.type("@a")
  await tick()
  expect(open()).toBe(true)
  removeRow()
  await tick()
  expect(open()).toBe(false)
})

test("an empty part that rebinds in the same commit keeps the menu open", async () => {
  const { editor, part, open } = setup()
  const removeEmpty = part("empty")
  await tick()
  editor.type("@zzz")
  await tick()
  removeEmpty()
  part("empty")
  await tick()
  expect(open()).toBe(true)
})

test("an empty part that mounts as the last row unmounts keeps the menu open", async () => {
  const { editor, part, open } = setup()
  const removeRow = part("item", { value: "alice", label: "Alice" })
  await tick()
  editor.type("@a")
  await tick()
  removeRow()
  part("empty")
  await tick()
  expect(open()).toBe(true)
})
