// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { bindTabStop } from "../src/foundation/focus/tabbable"

afterEach(() => document.body.replaceChildren())

const flush = () => new Promise((resolve) => setTimeout(resolve))

function render(markup: string) {
  document.body.innerHTML = markup
  return document.querySelector<HTMLElement>("#region")!
}

test("a region whose only controls are inert is a tab stop until they stop being inert", async () => {
  const region = render(
    `<div id="region"><div inert><button>Play</button></div></div>`
  )
  const { stop } = bindTabStop(region, () => true)
  expect(region.getAttribute("tabindex")).toBe("0")
  region.querySelector("[inert]")!.removeAttribute("inert")
  await flush()
  expect(region.hasAttribute("tabindex")).toBe(false)
  region.querySelector("div")!.setAttribute("inert", "")
  await flush()
  expect(region.getAttribute("tabindex")).toBe("0")
  stop()
})

test("a region inside inert content keeps counting its controls", () => {
  const region = render(
    `<div inert><div id="region"><button>Play</button></div></div>`
  )
  const { stop } = bindTabStop(region, () => true)
  expect(region.hasAttribute("tabindex")).toBe(false)
  stop()
})
