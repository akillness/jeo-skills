// @vitest-environment jsdom
// How far a list scrolls to show an item: only as far as it takes, keeping
// the item clear of the list's scroll padding, like scrollIntoView.
import { afterEach, describe, expect, test, vi } from "vitest"
import { scrollToShow } from "../src/foundation/focus/collection"
import { revealInList } from "../src/foundation/lists/listbox-engine"

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe("scrollToShow", () => {
  test("keeps the span its padding away from the edge it scrolls toward", () => {
    expect(scrollToShow(0, 100, 100, 20, 32, 32)).toBe(52)
    expect(scrollToShow(200, 100, 160, 20, 32, 32)).toBe(128)
  })

  test("leaves a span already inside the padding where it is", () => {
    expect(scrollToShow(0, 100, 40, 20, 32, 32)).toBe(0)
  })

  test("doesn't scroll past the start to clear the padding of the first span", () => {
    expect(scrollToShow(50, 100, 0, 20, 32, 32)).toBe(0)
  })

  test("is unchanged without padding", () => {
    expect(scrollToShow(0, 100, 100, 20)).toBe(20)
    expect(scrollToShow(200, 100, 160, 20)).toBe(160)
  })
})

// A 100px list of twenty 20px options, with layout faked since jsdom has none.
function list(style: Record<string, string>) {
  const root = document.createElement("div")
  const options = Array.from({ length: 20 }, () =>
    root.appendChild(document.createElement("div"))
  )
  document.body.append(root)
  Object.defineProperties(root, {
    scrollTop: { value: 0, writable: true },
    clientHeight: { value: 100 },
    scrollHeight: { value: 400 },
    clientTop: { value: 1 },
  })
  root.getBoundingClientRect = () => new DOMRect(0, 0, 100, 102)
  options.forEach((option, index) => {
    Object.defineProperty(option, "offsetHeight", { value: 20 })
    option.getBoundingClientRect = () =>
      new DOMRect(0, root.clientTop + index * 20 - root.scrollTop, 100, 20)
  })
  vi.stubGlobal("getComputedStyle", () => ({ overflowY: "auto", ...style }))
  return { root, options }
}

describe("revealInList", () => {
  const padded = { scrollPaddingTop: "32px", scrollPaddingBottom: "32px" }

  test("keeps an option clear of the scroll padding at both ends", () => {
    const { root, options } = list(padded)
    revealInList(options[5]!, root)
    expect(root.scrollTop).toBe(52)
    root.scrollTop = 200
    revealInList(options[8]!, root)
    expect(root.scrollTop).toBe(128)
  })

  test("stops at the end of the list for the last option", () => {
    const { root, options } = list(padded)
    revealInList(options[19]!, root)
    expect(root.scrollTop).toBe(300)
  })

  test("reads padding of auto as none", () => {
    const { root, options } = list({
      scrollPaddingTop: "auto",
      scrollPaddingBottom: "auto",
    })
    revealInList(options[5]!, root)
    expect(root.scrollTop).toBe(20)
    root.scrollTop = 200
    revealInList(options[8]!, root)
    expect(root.scrollTop).toBe(160)
  })
})
