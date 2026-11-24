import { describe, expect, test } from "vitest"
import {
  rubberBand,
  rubberBandInverse,
  rubberBandSlope,
} from "../../src/foundation/motion/rubber-band"

describe("rubber band", () => {
  test("matches UIScrollView's curve with c = 0.55 and d = 800", () => {
    expect(rubberBand(100, 800)).toBeCloseTo(51.5, 1)
    expect(rubberBand(200, 800)).toBeCloseTo(96.7, 1)
    expect(rubberBand(400, 800)).toBeCloseTo(172.5, 1)
  })

  test("never reaches the dimension", () => {
    expect(rubberBand(1e9, 800)).toBeLessThan(800)
  })

  test("the inverse returns the travel that shows a given overshoot", () => {
    for (const travel of [1, 50, 300, 2000]) {
      expect(rubberBandInverse(rubberBand(travel, 800), 800)).toBeCloseTo(
        travel,
        6
      )
    }
  })

  test("the slope is the curve's derivative", () => {
    for (const travel of [0.001, 40, 400]) {
      const numeric =
        (rubberBand(travel + 0.01, 800) - rubberBand(travel - 0.001, 800)) /
        0.011
      expect(rubberBandSlope(travel, 800)).toBeCloseTo(numeric, 3)
    }
  })
})
