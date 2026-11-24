import { describe, expect, test } from "vitest"
import {
  settleTime,
  solveSpring,
  springLinearEasing,
} from "../../src/foundation/motion/spring"

describe("spring", () => {
  test.each([0.6, 1, 1.4])(
    "with damping %f it starts at its displacement and velocity",
    (dampingRatio) => {
      const solver = solveSpring(0.4, dampingRatio, 200, -3)
      expect(solver.position(0)).toBeCloseTo(200, 9)
      expect(solver.velocity(0)).toBeCloseTo(-3, 9)
    }
  )

  test.each([0.6, 1, 1.4])(
    "with damping %f its velocity is the derivative of its position",
    (dampingRatio) => {
      const solver = solveSpring(0.4, dampingRatio, 200, -3)
      for (const t of [10, 120, 333]) {
        const numeric =
          (solver.position(t + 0.001) - solver.position(t - 0.001)) / 0.002
        expect(solver.velocity(t)).toBeCloseTo(numeric, 5)
      }
    }
  )

  test("a 500px critically damped move with response 0.5 settles in about 0.735s", () => {
    expect(settleTime(solveSpring(0.5, 1, 500, 0))).toBeGreaterThan(700)
    expect(settleTime(solveSpring(0.5, 1, 500, 0))).toBeLessThan(760)
  })

  test("an underdamped spring overshoots and a critically damped one doesn't", () => {
    const minimum = (solver: ReturnType<typeof solveSpring>) =>
      Math.min(...Array.from({ length: 1000 }, (_, t) => solver.position(t)))
    expect(minimum(solveSpring(0.5, 0.7, 500, 0))).toBeLessThan(-1)
    expect(minimum(solveSpring(0.5, 1, 500, 0))).toBeGreaterThanOrEqual(0)
  })

  test("the linear() easing runs from 0 to 1", () => {
    const solver = solveSpring(0.5, 1, -300, 0)
    const easing = springLinearEasing(solver, 0, 300, settleTime(solver))
    expect(easing.startsWith("linear(0, ")).toBe(true)
    expect(easing.endsWith(", 1)")).toBe(true)
  })

  test("a spring that starts at its target has no progress to ease, so the easing is plain linear", () => {
    expect(
      springLinearEasing(solveSpring(0.34, 0.88, 0, -1), 200, 200, 600)
    ).toBe("linear")
  })
})
