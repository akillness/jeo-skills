// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import {
  accessibleName,
  hasAccessibleName,
} from "../src/foundation/text/accessible-name"

afterEach(() => document.body.replaceChildren())

// The name of the element with id "target" in `markup`.
function nameIn(markup: string) {
  document.body.innerHTML = markup
  return accessibleName(document.getElementById("target")!)
}

test("an input with only a title is named by it", () => {
  expect(nameIn(`<input id="target" title="Volume">`)).toBe("Volume")
})

test("an input's labels join in order", () => {
  expect(
    nameIn(
      `<label for="target">Start</label><label for="target">date</label><input id="target">`
    )
  ).toBe("Start date")
})

test("aria-labelledby text collapses its whitespace", () => {
  expect(
    nameIn(
      `<span id="font">Font   size</span><div id="target" aria-labelledby="font"></div>`
    )
  ).toBe("Font size")
})

test("an element's content leaves out what's hidden inside it", () => {
  expect(
    nameIn(
      `<button id="target" role="checkbox"><span hidden>Hidden only</span></button>`
    )
  ).toBe("")
  expect(
    nameIn(`<button id="target">
      Save
      <span aria-hidden="true">⌘S</span>
      <span style="display: none">draft</span>
      <span style="visibility: hidden">copy</span>
    </button>`)
  ).toBe("Save")
})

test("a hidden element aria-labelledby points at still names it", () => {
  expect(
    nameIn(`<span id="label" hidden>Explicit label</span>
      <button id="target" role="checkbox" aria-labelledby="label"></button>`)
  ).toBe("Explicit label")
})

test("an icon button is named by its image's alt or its icon's label or title", () => {
  expect(nameIn(`<button id="target"><img alt="Close"></button>`)).toBe("Close")
  expect(
    nameIn(
      `<button id="target"><svg role="img" aria-label="Settings"></svg></button>`
    )
  ).toBe("Settings")
  expect(
    nameIn(
      `<button id="target"><svg><title>Search</title><path /></svg></button>`
    )
  ).toBe("Search")
  expect(
    nameIn(
      `<button id="target"><svg aria-hidden="true"><title>Search</title></svg>Find</button>`
    )
  ).toBe("Find")
})

test("an element inside another's content adds its own label", () => {
  expect(
    nameIn(`<button id="target"><span aria-label="Delete"></span> row</button>`)
  ).toBe("Delete row")
  expect(
    nameIn(
      `<span id="what">Archive</span><button id="target"><span aria-labelledby="what"></span></button>`
    )
  ).toBe("Archive")
})

test("a field inside its label doesn't repeat in its name", () => {
  expect(
    nameIn(`<label>Volume <input id="target" title="Level"></label>`)
  ).toBe("Volume")
})

test("aria-labelledby inside a shadow root finds its label there", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = host.attachShadow({ mode: "open" })
  root.innerHTML = `<span id="region">Region</span><div id="list" role="listbox" aria-labelledby="region"></div>`
  expect(accessibleName(root.getElementById("list")!)).toBe("Region")
})

test("an untitled dialog opened from an icon trigger is named by the icon, without a warning", async () => {
  const { dialog } = await import("../src/components/dialog/dialog")
  const { attrs, bind } = await import("../src/foundation/kernel/part")
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const instance = dialog({ id: "d" })
  const trigger = document.createElement("button")
  trigger.innerHTML = `<svg role="img" aria-label="Settings"></svg>`
  const content = Object.assign(document.createElement("div"), {
    getAnimations: () => [],
  })
  document.body.append(trigger, content)
  const unbind = [
    bind(instance.part("trigger"), trigger),
    bind(instance.part("content"), content),
  ]
  instance.api.open()
  await vi.waitFor(() =>
    expect(attrs(instance.part("content"))["aria-label"]).toBe("Settings")
  )
  await new Promise((resolve) => setTimeout(resolve))
  expect(warn.mock.calls.flat().join(" ")).not.toContain("no accessible name")
  unbind.forEach((run) => run())
  instance.destroy()
  warn.mockRestore()
})

// Chromium walks the whole page for a control's labels, so a page of named
// buttons that each read theirs mounts in quadratic time.
test("asking whether a button its text names has a name reads no labels", () => {
  document.body.innerHTML = `<button id="target">Save</button>`
  const labels = vi.spyOn(HTMLButtonElement.prototype, "labels", "get")
  expect(hasAccessibleName(document.getElementById("target")!)).toBe(true)
  expect(labels).not.toHaveBeenCalled()
  labels.mockRestore()
})

test("a button only its label names has a name", () => {
  expect(
    nameIn(`<label for="target">Save</label><button id="target"></button>`)
  ).toBe("Save")
  expect(hasAccessibleName(document.getElementById("target")!)).toBe(true)
})

test("children that aren't plain inline read as separate words, inline ones run together", () => {
  expect(
    nameIn(
      `<button id="target" style="display: flex"><span style="display: block">Read</span><span style="display: block">Swedish orders</span></button>`
    )
  ).toBe("Read Swedish orders")
  expect(
    nameIn(
      `<button id="target"><span style="display: inline-block">Read</span><span style="display: inline-block">Swedish</span></button>`
    )
  ).toBe("Read Swedish")
  expect(nameIn(`<button id="target"><b>Hel</b>lo</button>`)).toBe("Hello")
  expect(
    nameIn(
      `<button id="target">Hel<span style="display: inline-block"></span>lo</button>`
    )
  ).toBe("Hello")
  expect(
    nameIn(
      `<button id="target">Hel<span style="display: block"></span>lo</button>`
    )
  ).toBe("Hel lo")
})
