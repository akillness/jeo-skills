// @vitest-environment jsdom
// A list that points at its trigger is named after the value the trigger
// shows, so an open list copies the trigger's name instead.
import { afterEach, expect, test } from "vitest"
import { select } from "../src/components/select/select"
import { mount } from "../src/testing/mount"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

type Slot = "trigger" | "label" | "content" | "list"

const items = `<item value="a">Alpha</item><item value="b">Beta</item>`

async function open(markup: string) {
  const view = mount(select, { defaultValue: "b" }, markup)
  mounts.push(view)
  const press = () => view.click(view.part("trigger")!)
  await press()
  return {
    naming: (slot: Slot) => [
      view.part(slot)!.getAttribute("aria-label"),
      view.part(slot)!.getAttribute("aria-labelledby"),
    ],
    idOf: (slot: Slot) => view.part(slot)!.id,
    close: press,
  }
}

test("a closed list points at its trigger, so the name is the trigger's alone", async () => {
  const view = await open(
    `<root><trigger aria-label="Letter"><value /></trigger><content>${items}</content></root>`
  )
  await view.close()
  expect(view.naming("content")).toEqual([null, view.idOf("trigger")])
})

test("a trigger named by aria-label names the list", async () => {
  const view = await open(
    `<root><trigger aria-label="Letter"><value /></trigger><content>${items}</content></root>`
  )
  expect(view.naming("content")).toEqual(["Letter", null])
})

test("a trigger named by a label element names the list", async () => {
  const label = document.body.appendChild(document.createElement("label"))
  label.htmlFor = "letter"
  label.textContent = "Letter"
  const view = await open(
    `<root><trigger id="letter"><value /></trigger><content>${items}</content></root>`
  )
  expect(view.naming("content")).toEqual(["Letter", null])
})

test("a list around a search field takes the trigger's name too", async () => {
  const view = await open(
    `<root><trigger aria-label="Letter"><value /></trigger><content><input aria-label="Search" /><list>${items}</list></content></root>`
  )
  expect(view.naming("list")).toEqual(["Letter", null])
  expect(view.naming("content")).toEqual([null, null])
})

test("a select's own label names the list by reference", async () => {
  const view = await open(
    `<root><label>Letter</label><trigger><value /></trigger><content>${items}</content></root>`
  )
  expect(view.naming("content")).toEqual([null, view.idOf("label")])
})

test("a trigger with no name keeps the list pointing at it", async () => {
  const view = await open(
    `<root><trigger><value /></trigger><content>${items}</content></root>`
  )
  expect(view.naming("content")).toEqual([null, view.idOf("trigger")])
})
