// @vitest-environment jsdom
// A findable virtual list rendered by Svelte, binding its text with attachments.
import { createVirtualizer } from "@ui-sdk/core"
import { flushSync, mount, tick, unmount } from "svelte"
import { afterEach, beforeAll, expect, test, vi } from "vitest"
import App from "./apps/virtualizer-find-app.svelte"

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {}
  Object.defineProperty(HTMLElement.prototype, "onbeforematch", {
    value: null,
    writable: true,
    configurable: true,
  })
})

let app: ReturnType<typeof mount> | undefined
let disconnect: (() => void) | undefined
afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  disconnect?.()
  document.body.replaceChildren()
})
// jsdom has no layout or find in page: a scroller of a fixed size whose scroll position can be set.
function scroller(height: number, contentHeight: () => number) {
  const el = document.createElement("div")
  let top = 0
  Object.defineProperties(el, {
    clientHeight: { get: () => height },
    clientWidth: { get: () => 300 },
    scrollHeight: { get: () => Math.max(height, contentHeight()) },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(
          0,
          Math.min(value, Math.max(0, contentHeight() - height))
        )
      },
    },
  })
  el.scrollTo = ((options: ScrollToOptions) => {
    el.scrollTop = options.top ?? top
  }) as typeof el.scrollTo
  document.body.append(el)
  return el
}

const pieces = (index: number) => [
  `Row ${index}`,
  index % 100 === 0 ? "needle" : "plain",
]

// Every row's number in page order, as find in page walks the text.
function order(el: Element) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const found: number[] = []
  while (walker.nextNode()) {
    const match = /^Row (\d+)$/.exec(walker.currentNode.textContent ?? "")
    if (match) {
      found.push(Number(match[1]))
    }
  }
  return found
}

const all = Array.from({ length: 1000 }, (_, index) => index)
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
const row = (el: Element, index: number) =>
  el.querySelector(`[data-index="${index}"]`)

function setup() {
  const virtual = createVirtualizer({
    count: () => 1000,
    estimate: () => 20,
    overscan: 2,
    findable: pieces,
  })
  const el = scroller(100, () => virtual.size())
  const content = document.createElement("div")
  el.append(content)
  disconnect = virtual.connect(el, { findable: true })
  app = mount(App, { target: content, props: { virtual } })
  flushSync()
  return { el, settle: () => tick() }
}

test("rows bind their text, a match renders its row before the next frame, and rows that leave give their text back", async () => {
  const { el, settle } = setup()
  await vi.dynamicImportSettled()
  await settle()
  expect(
    [...row(el, 1)!.querySelectorAll("span")].map((span) => span.textContent)
  ).toEqual(["Row 1", "plain"])
  expect(order(el)).toEqual(all)
  el.scrollTop = 8000
  el.dispatchEvent(new Event("scroll"))
  await settle()
  expect(row(el, 1)).toBeNull()
  expect(order(el)).toEqual(all)
  const match = [
    ...el.querySelectorAll("[data-findable-layer] > div > div"),
  ].find((node) => node.textContent === "Row 500 needle")!
  const text = match.firstChild
  match.dispatchEvent(new Event("beforematch", { bubbles: true }))
  await settle()
  expect(row(el, 500)).not.toBeNull()
  await frame()
  expect(row(el, 500)!.querySelector("span")!.firstChild).toBe(text)
  expect(order(el)).toEqual(all)
})
