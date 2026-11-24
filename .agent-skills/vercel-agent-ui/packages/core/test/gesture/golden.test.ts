import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { sheetPhysics } from "../../src/foundation/motion/physics"
import {
  compareTrajectories,
  replayGolden,
  type GoldenTrajectory,
} from "./replay"

// 24 gestures on iOS 26.5 system sheets, recorded frame by frame in the
// simulator. UIKit's median
// tracking lag on those recordings was 31ms.
const directory = join(import.meta.dirname, "goldens")
const goldens: GoldenTrajectory[] = readdirSync(directory)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")))
const lag = 31.25

const results = goldens.map((golden) => {
  const replayed = replayGolden(golden, sheetPhysics.ios, lag)
  return {
    name: golden.name,
    isSameOutcome: replayed.outcome.snapPoint === golden.outcome.snapPoint,
    ...compareTrajectories(golden.sheet, replayed.sheet),
  }
})

describe("golden replay against UIKit", () => {
  test("there are 24 recorded gestures", () => {
    expect(goldens).toHaveLength(24)
  })

  test("the iOS preset rests where UIKit rested for at least 22 of 24 gestures", () => {
    const agreeing = results.filter((result) => result.isSameOutcome)
    expect(
      agreeing.length,
      results
        .filter((result) => !result.isSameOutcome)
        .map((r) => r.name)
        .join(", ")
    ).toBeGreaterThanOrEqual(22)
  })

  test("the median path error is under 15px", () => {
    const errors = results
      .map((result) => result.rmsError)
      .sort((a, b) => a - b)
    expect(errors[Math.floor(errors.length / 2)]).toBeLessThan(15)
  })
})
