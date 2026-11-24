import { describe, expect, test } from "vitest"
import {
  chooseSnapTarget,
  projectDistance,
} from "../../src/foundation/motion/projection"

describe("projection", () => {
  test("1000pt/s projects 499pt at 0.998 and 99pt at 0.99", () => {
    expect(projectDistance(1, 0.998)).toBeCloseTo(499, 5)
    expect(projectDistance(1, 0.99)).toBeCloseTo(99, 5)
  })

  const base = {
    candidates: [0, 300, 600, 800],
    rate: 0.998,
    minFlingVelocity: 0.3,
    skipSnapPoints: true,
  }

  test("a slow release goes to the nearest candidate", () => {
    expect(chooseSnapTarget({ ...base, extent: 420, velocity: 0.1 })).toBe(1)
    expect(chooseSnapTarget({ ...base, extent: 480, velocity: -0.1 })).toBe(2)
  })

  test("a fling lands on the candidate nearest its projection, passing others", () => {
    expect(chooseSnapTarget({ ...base, extent: 310, velocity: 1 })).toBe(3)
  })

  test("a fling moves at least one candidate in its direction", () => {
    expect(
      chooseSnapTarget({ ...base, extent: 320, velocity: 0.31, rate: 0.9 })
    ).toBe(2)
  })

  test("without skipping, a fling moves at most one candidate", () => {
    expect(
      chooseSnapTarget({
        ...base,
        extent: 310,
        velocity: 2,
        skipSnapPoints: false,
      })
    ).toBe(2)
  })

  test("a fling down from the smallest candidate projects to dismissal", () => {
    expect(chooseSnapTarget({ ...base, extent: 290, velocity: -0.8 })).toBe(0)
  })
})
