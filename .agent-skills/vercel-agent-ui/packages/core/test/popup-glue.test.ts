// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest"
import { ownsEvent } from "../src/foundation/popups/popup-elements"
import {
  contentAnchor,
  placementOptions,
} from "../src/foundation/popups/popup-features"

afterEach(() => document.body.replaceChildren())

describe("contentAnchor", () => {
  test("finds a selector in the content's shadow root before the document", () => {
    document.body.innerHTML = `<button id="anchor">Outside</button><div id="host"></div>`
    const shadow = document
      .getElementById("host")!
      .attachShadow({ mode: "open" })
    shadow.innerHTML = `<button id="anchor">Inside</button><div id="content"></div>`
    const content = shadow.getElementById("content")!
    expect(contentAnchor(content, "#anchor", () => undefined)).toBe(
      shadow.getElementById("anchor")
    )
  })

  test("falls back to the document when the content's root holds no match", () => {
    document.body.innerHTML = `<button id="anchor">Outside</button><div id="host"></div>`
    const shadow = document
      .getElementById("host")!
      .attachShadow({ mode: "open" })
    shadow.innerHTML = `<div id="content"></div>`
    const content = shadow.getElementById("content")!
    expect(contentAnchor(content, "#anchor", () => undefined)).toBe(
      document.getElementById("anchor")
    )
  })

  test("takes an element as given, and the fallback without a setting", () => {
    const content = document.createElement("div")
    const anchor = document.createElement("button")
    const trigger = document.createElement("button")
    expect(contentAnchor(content, anchor, () => trigger)).toBe(anchor)
    expect(contentAnchor(content, null, () => trigger)).toBe(trigger)
  })
})

test("placementOptions takes the props over the component's defaults", () => {
  expect(placementOptions({}, { align: "start" })).toMatchObject({
    side: "bottom",
    align: "start",
    sideOffset: 4,
    alignOffset: 0,
  })
  expect(
    placementOptions(
      { side: "top", sideOffset: 8 },
      { side: "right", align: "center", sideOffset: 0 }
    )
  ).toMatchObject({ side: "top", align: "center", sideOffset: 8 })
})

test("ownsEvent leaves a nested part's events to it", () => {
  document.body.innerHTML = `<div data-slot="menu-content" id="outer"><button id="a"></button>
    <div data-slot="menu-content" id="inner"><button id="b"></button></div></div>`
  const outer = document.getElementById("outer")!
  const inner = document.getElementById("inner")!
  const from = (id: string) => {
    const event = new KeyboardEvent("keydown", { bubbles: true })
    let seen: Event | undefined
    outer.addEventListener("keydown", (e) => (seen = e), { once: true })
    document.getElementById(id)!.dispatchEvent(event)
    return seen!
  }
  expect(ownsEvent(outer, from("a"))).toBe(true)
  expect(ownsEvent(outer, from("b"))).toBe(false)
  expect(ownsEvent(inner, from("b"))).toBe(true)
})
