import { describe, expect, test } from "vitest"
import {
  createVelocityTracker,
  leastSquaresVelocity,
} from "../../src/foundation/motion/velocity"

// A deterministic jitter of ±0.25px, the size of touch quantization noise.
const jitter = (index: number) => (((index * 7919) % 11) / 10 - 0.5) * 0.5

// Feeds `position(t)` sampled every 1000/rate ms until `end` and returns the
// tracker's velocity at `end`.
function sampledVelocity(
  position: (t: number) => number,
  rate: number,
  end: number
) {
  const tracker = createVelocityTracker()
  const interval = 1000 / rate
  const count = Math.round(end / interval)
  for (let index = 0; index <= count; index++) {
    tracker.add(index * interval, position(index * interval) + jitter(index))
  }
  return tracker.velocity(end)
}

describe("velocity", () => {
  // A flick that accelerates like a finger: x = D·(t/T)³, so v(T) = 3D/T,
  // here 4px/ms at release.
  const flick = (t: number) => 200 * (t / 150) ** 3

  test.each([60, 120, 240])(
    "a flick sampled at %iHz reads within 10%% of its true release velocity",
    (rate) => {
      expect(sampledVelocity(flick, rate, 150)).toBeGreaterThan(4 * 0.9)
      expect(sampledVelocity(flick, rate, 150)).toBeLessThan(4 * 1.1)
    }
  )

  test("the three rates agree with each other within 10%", () => {
    const readings = [60, 120, 240].map((rate) =>
      sampledVelocity(flick, rate, 150)
    )
    expect(Math.max(...readings) / Math.min(...readings)).toBeLessThan(1.1)
  })

  test("a slow drag that ends in a 2px/ms flick reads at least 1.8px/ms", () => {
    // 600ms at 0.1px/ms, then 50ms accelerating linearly to 2px/ms.
    const position = (t: number) =>
      t <= 600 ? 0.1 * t : 60 + 0.1 * (t - 600) + (1.9 / 100) * (t - 600) ** 2
    expect(sampledVelocity(position, 120, 650)).toBeGreaterThanOrEqual(1.8)
  })

  test("a 50ms rest before lifting reads 0", () => {
    const tracker = createVelocityTracker()
    for (let t = 0; t <= 100; t += 8) {
      tracker.add(t, t * 2)
    }
    expect(tracker.velocity(150)).toBe(0)
  })

  test("samples with a repeated timestamp are dropped", () => {
    const tracker = createVelocityTracker()
    tracker.add(0, 0)
    tracker.add(8, 8)
    tracker.add(8, 500)
    tracker.add(16, 16)
    expect(tracker.velocity(16)).toBeCloseTo(1, 5)
  })

  test("the estimate is clamped to 8px/ms", () => {
    const tracker = createVelocityTracker()
    for (let t = 0; t <= 40; t += 8) {
      tracker.add(t, t * 20)
    }
    expect(tracker.velocity(40)).toBe(8)
  })

  test("two samples fall back to their slope", () => {
    expect(leastSquaresVelocity([0, 10], [0, 5])).toBe(0.5)
  })

  test("three samples that decelerate hard keep the direction of travel", () => {
    expect(leastSquaresVelocity([0, 1.3, 9], [430, 315, 200])).toBeLessThan(0)
  })

  test("a steady 1px/ms drag with ±0.5px of noise reads within 10%", () => {
    const noisy = (t: number) => t + jitter(Math.round(t * 3)) * 2
    for (const rate of [60, 120, 240]) {
      expect(Math.abs(sampledVelocity(noisy, rate, 400) - 1)).toBeLessThan(0.1)
    }
  })

  test("samples older than the horizon are ignored", () => {
    const tracker = createVelocityTracker()
    for (let t = 0; t <= 400; t += 8) {
      tracker.add(t, t < 200 ? t * 3 : 600 + (t - 200))
    }
    expect(tracker.velocity(400)).toBeCloseTo(1, 5)
  })
})
