import { describe, expect, test } from "vitest"
import { dimAmount, expandAmount } from "../../src/foundation/motion/curves"

describe("styling curves", () => {
  const snaps = [160, 400, 800]

  test("without an undimmed snap point, the dim ramps in up to the smallest", () => {
    expect(dimAmount(0, snaps)).toBe(0)
    expect(dimAmount(80, snaps)).toBe(0.5)
    expect(dimAmount(600, snaps)).toBe(1)
  })

  test("above an undimmed snap point, the dim ramps to the next one", () => {
    expect(dimAmount(400, snaps, 1)).toBe(0)
    expect(dimAmount(600, snaps, 1)).toBe(0.5)
    expect(dimAmount(800, snaps, 1)).toBe(1)
  })

  test("expand runs from the second-largest snap point to the largest", () => {
    expect(expandAmount(400, snaps)).toBe(0)
    expect(expandAmount(700, snaps)).toBe(0.75)
    expect(expandAmount(500, [800])).toBe(0.625)
  })
})
