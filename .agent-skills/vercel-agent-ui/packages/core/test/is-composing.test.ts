// @vitest-environment jsdom
import { describe, expect, test } from "vitest"
import { isComposing } from "../src/index"

const enter = (init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { key: "Enter", ...init })

describe("isComposing", () => {
  test("an Enter during composition, and Safari's last one, belong to the input method", () => {
    expect(isComposing(enter({ isComposing: true }))).toBe(true)
    expect(isComposing(enter({ keyCode: 229 }))).toBe(true)
    expect(isComposing(enter())).toBe(false)
    expect(isComposing(enter({ keyCode: 13 }))).toBe(false)
  })

  test("reads React's events through nativeEvent", () => {
    expect(isComposing({ nativeEvent: enter({ isComposing: true }) })).toBe(
      true
    )
    expect(isComposing({ nativeEvent: enter({ keyCode: 229 }) })).toBe(true)
    expect(isComposing({ nativeEvent: enter() })).toBe(false)
  })

  test("reads an input event for a half-typed word, from the DOM or React's onChange", () => {
    expect(isComposing(new InputEvent("input", { isComposing: true }))).toBe(
      true
    )
    expect(isComposing(new InputEvent("input"))).toBe(false)
    const nativeEvent: Event = new InputEvent("input", { isComposing: true })
    expect(isComposing({ nativeEvent })).toBe(true)
  })
})
