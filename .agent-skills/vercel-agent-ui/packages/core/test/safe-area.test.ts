import { afterEach, describe, expect, test, vi } from "vitest"
import { createSafeArea } from "../src/foundation/popups/safe-area"

// A submenu to the right of a trigger that ends at x = 200.
const submenu = {
  getBoundingClientRect: () => ({
    left: 200,
    right: 360,
    top: 100,
    bottom: 300,
  }),
} as HTMLElement

afterEach(() => vi.useRealTimers())

describe("safe area", () => {
  test("moves toward the submenu inside the triangle are protected", () => {
    const area = createSafeArea()
    area.start({ x: 190, y: 120 }, submenu)
    expect(area.contains({ x: 195, y: 140 }, () => {})).toBe(true)
  })

  test("moves away from the submenu are not", () => {
    const area = createSafeArea()
    area.start({ x: 190, y: 120 }, submenu)
    expect(area.contains({ x: 150, y: 140 }, () => {})).toBe(false)
  })

  test("moves outside the triangle are not", () => {
    const area = createSafeArea()
    area.start({ x: 190, y: 120 }, submenu)
    expect(area.contains({ x: 195, y: 400 }, () => {})).toBe(false)
  })

  test("moves straight down from a trigger next to the submenu are not", () => {
    const area = createSafeArea()
    area.start({ x: 195, y: 120 }, submenu)
    expect(area.contains({ x: 195, y: 130 }, () => {})).toBe(false)
  })

  test("resting inside the triangle expires the protection", () => {
    vi.useFakeTimers()
    const area = createSafeArea({ restTimeout: 300 })
    area.start({ x: 190, y: 120 }, submenu)
    let rested = false
    expect(area.contains({ x: 195, y: 140 }, () => (rested = true))).toBe(true)
    vi.advanceTimersByTime(300)
    expect(rested).toBe(true)
    expect(area.contains({ x: 196, y: 141 }, () => {})).toBe(false)
  })

  test("works when the submenu flipped to the left", () => {
    const left = {
      getBoundingClientRect: () => ({
        left: 0,
        right: 100,
        top: 100,
        bottom: 300,
      }),
    } as HTMLElement
    const area = createSafeArea()
    area.start({ x: 110, y: 120 }, left)
    expect(area.contains({ x: 105, y: 140 }, () => {})).toBe(true)
  })

  test("along y, moves toward a panel below cross other triggers, and moves sideways don't", () => {
    const panel = {
      getBoundingClientRect: () => ({
        left: 80,
        right: 400,
        top: 60,
        bottom: 160,
      }),
    } as HTMLElement
    const crossing = createSafeArea()
    crossing.start({ x: 170, y: 40 }, panel, "y")
    expect(crossing.contains({ x: 180, y: 50 }, () => {})).toBe(true)
    const sideways = createSafeArea()
    sideways.start({ x: 170, y: 40 }, panel, "y")
    expect(sideways.contains({ x: 200, y: 41 }, () => {})).toBe(false)
  })
})
