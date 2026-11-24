import { describe, expect, test } from "vitest"
import {
  inPopupElement,
  registerPopupElement,
} from "../src/foundation/popups/popup-elements"

// The shape of a node that the ancestor walk reads.
const node = (parentNode: Node | null = null) =>
  ({ parentNode }) as unknown as Element

describe("popup elements", () => {
  test("a node inside a registered popup element is in a popup", () => {
    const content = node()
    const field = node(content)
    const off = registerPopupElement(content)
    expect(inPopupElement(field)).toBe(true)
    off()
    expect(inPopupElement(field)).toBe(false)
  })

  test("an element registered twice stays registered until both undo it", () => {
    const content = node()
    const offAdapter = registerPopupElement(content)
    const offPopup = registerPopupElement(content)
    offPopup()
    offPopup()
    expect(inPopupElement(content)).toBe(true)
    offAdapter()
    expect(inPopupElement(content)).toBe(false)
  })
})
