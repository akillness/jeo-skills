import { describe, expect, test } from "vitest"
import { contentScroll } from "../../src/foundation/motion/content-scroll"
import {
  initialState,
  next,
  type SheetConfig,
  type SheetEvent,
  type SheetState,
} from "../../src/foundation/motion/machine"
import { sheetPhysics } from "../../src/foundation/motion/physics"
import { rubberBand } from "../../src/foundation/motion/rubber-band"

// Defaults that follow UIScrollView's projection and band. The fitted preset has its own tests below and in golden.test.ts.
const iosPhysics = {
  ...sheetPhysics.ios,
  projectionRate: 0.998,
  minFlingVelocity: 0.3,
  response: 0.5,
  momentumDampingRatio: 0.85,
  rubberBand: 0.55,
  rubberBandDimension: null,
}

const config: SheetConfig = {
  snapPoints: [
    { id: "medium", extent: 400 },
    { id: "large", extent: 800 },
  ],
  dimension: 874,
  dismissible: true,
  expandOnScroll: true,
  physics: iosPhysics,
  contentScroll,
}

// Runs events from a resting state and returns the final state and every effect.
function run(
  events: SheetEvent[],
  options: { from?: SheetState; config?: SheetConfig } = {}
) {
  let state = options.from ?? initialState(400, 0)
  const effects = []
  for (const event of events) {
    const result = next(state, event, options.config ?? config)
    state = result.state
    effects.push(...result.effects)
  }
  return { state, effects }
}

const down = (y: number, time = 0): SheetEvent => ({
  type: "down",
  time,
  x: 100,
  y,
  pointer: "touch",
})
const move = (
  y: number,
  time: number,
  scroll: { atStart: boolean; atEnd: boolean } | null = null
): SheetEvent => ({
  type: "move",
  time,
  x: 100,
  y,
  scroll,
})
const up = (time: number, velocity: number): SheetEvent => ({
  type: "up",
  time,
  velocity,
})

describe("sheet machine", () => {
  test("a tap doesn't move the sheet", () => {
    const { state, effects } = run([down(500), move(503, 8), up(16, 0)])
    expect(effects).toEqual([])
    expect(state).toMatchObject({ phase: "idle", extent: 400, restingIndex: 0 })
  })

  test("past the slop the sheet follows the finger less the slop, whatever the input rate", () => {
    expect(run([down(500), move(490, 8), move(450, 16)]).effects).toEqual([
      { type: "move", extent: 402 },
      { type: "move", extent: 442 },
    ])
    expect(run([down(500), move(470, 8)]).effects).toEqual([
      { type: "move", extent: 422 },
    ])
  })

  test("a horizontal move leaves the gesture to the page", () => {
    const { state, effects } = run([
      down(500),
      { type: "move", time: 8, x: 130, y: 499, scroll: null },
    ])
    expect(state.phase).toBe("idle")
    expect(effects).toEqual([])
  })

  test("a slow release settles on the nearest snap point", () => {
    const { effects } = run([
      down(500),
      move(490, 8),
      move(350, 200),
      up(210, -0.05),
    ])
    expect(effects.filter((effect) => effect.type !== "move")).toEqual([
      expect.objectContaining({
        type: "settle",
        from: 542,
        to: 400,
        dampingRatio: 1,
      }),
    ])
  })

  test("a flick up from medium snaps to large with some bounce", () => {
    const { effects } = run([
      down(500),
      move(490, 8),
      move(440, 40),
      up(48, -1.5),
    ])
    expect(effects.filter((effect) => effect.type !== "move")).toEqual([
      expect.objectContaining({
        type: "settle",
        to: 800,
        velocity: 1.5,
        dampingRatio: iosPhysics.momentumDampingRatio,
      }),
      { type: "snap", id: "large", reason: "swipe" },
    ])
  })

  test("a flick down from the smallest snap point dismisses", () => {
    const { effects } = run([
      down(500),
      move(510, 8),
      move(560, 40),
      up(48, 1.2),
    ])
    expect(effects.filter((effect) => effect.type !== "move")).toEqual([
      expect.objectContaining({ type: "settle", to: 0 }),
      { type: "dismiss", reason: "swipe" },
    ])
  })

  test("past the largest snap point the sheet rubber-bands", () => {
    const from = initialState(800, 1)
    const { effects } = run([down(200), move(190, 8), move(90, 40)], { from })
    expect(effects.at(-1)).toEqual({
      type: "move",
      extent: 800 + rubberBand(102, 874),
    })
  })

  test("a sheet that can't be dismissed resists, settles back and reports the attempt", () => {
    const strict = { ...config, dismissible: false }
    const { effects } = run(
      [down(500), move(510, 8), move(800, 200), up(210, 1.5)],
      { config: strict }
    )
    expect(effects[1]).toEqual({
      type: "move",
      extent: 400 - rubberBand(292, 874),
    })
    expect(effects.slice(-2)).toEqual([
      expect.objectContaining({ type: "settle", to: 400 }),
      { type: "attempt-dismiss", reason: "swipe" },
    ])
  })

  test("a touch during a settle catches the sheet where the spring is", () => {
    const settling = run([
      down(500),
      move(490, 8),
      move(440, 40),
      up(48, -1.5),
    ]).state
    const { state, effects } = run([down(300, 148)], { from: settling })
    expect(state.phase).toBe("dragging")
    const caught = (effects[0] as { extent: number }).extent
    expect(caught).toBeGreaterThan(470)
    expect(caught).toBeLessThan(800)
  })

  test("pulling down on scrolled content scrolls it first, then moves the sheet in the same gesture", () => {
    const from = initialState(800, 1)
    const scrolled = { atStart: false, atEnd: false }
    const top = { atStart: true, atEnd: false }
    const { effects } = run(
      [
        down(200),
        move(210, 8, scrolled),
        move(260, 40, scrolled),
        move(270, 48, top),
        move(320, 80, top),
      ],
      {
        from,
      }
    )
    expect(effects).toEqual([{ type: "move", extent: 750 }])
  })

  test("pushing up at the largest snap point scrolls the content instead", () => {
    const top = { atStart: true, atEnd: false }
    const scrolled = { atStart: false, atEnd: false }
    const { effects } = run([
      down(500),
      move(490, 8, top),
      move(100, 100, top),
      move(80, 108, top),
      move(30, 116, scrolled),
    ])
    expect(effects).toEqual([
      { type: "move", extent: 402 },
      { type: "move", extent: 792 },
      { type: "move", extent: 800 },
      { type: "scroll", delta: 12 },
      { type: "scroll", delta: 50 },
    ])
  })

  test("a release while scrolling the content rests on the largest snap point and lets the content coast", () => {
    const top = { atStart: true, atEnd: false }
    const scrolled = { atStart: false, atEnd: false }
    const { state, effects } = run([
      down(500),
      move(490, 8, top),
      move(80, 108, top),
      move(30, 116, scrolled),
      up(124, -2),
    ])
    expect(effects.slice(-2)).toEqual([
      { type: "fling-scroll", velocity: 2 },
      { type: "snap", id: "large", reason: "swipe" },
    ])
    expect(state).toMatchObject({ phase: "idle", extent: 800, restingIndex: 1 })
  })

  test("a programmatic snap settles with the imperative reason", () => {
    const { effects } = run([
      { type: "snap-to", time: 0, id: "large", reason: "imperative" },
    ])
    expect(effects).toEqual([
      expect.objectContaining({ type: "settle", from: 400, to: 800 }),
      { type: "snap", id: "large", reason: "imperative" },
    ])
  })

  test("the scroll-snap driver's rest reports the snap point it landed on", () => {
    expect(run([{ type: "rest", extent: 799 }]).effects).toEqual([
      { type: "snap", id: "large", reason: "swipe" },
    ])
    expect(run([{ type: "rest", extent: 0 }]).effects).toEqual([
      { type: "dismiss", reason: "swipe" },
    ])
  })

  test("a snap carries the reason that asked for it", () => {
    const { effects } = run([
      { type: "snap-to", time: 0, id: "large", reason: "content-resize" },
    ])
    expect(effects.at(-1)).toEqual({
      type: "snap",
      id: "large",
      reason: "content-resize",
    })
  })

  test("a refused dismissal dips toward closing and springs back to where it rested", () => {
    const { state, effects } = run([{ type: "nudge", time: 0 }])
    expect(effects).toEqual([
      expect.objectContaining({
        type: "settle",
        from: 400,
        to: 400,
        velocity: -1,
      }),
    ])
    expect(state).toMatchObject({ phase: "settling", targetIndex: 0 })
  })

  test("a closed sheet ignores a nudge", () => {
    expect(
      run([{ type: "nudge", time: 0 }], { from: initialState(0, -1) }).effects
    ).toEqual([])
  })

  test("with the iOS preset, the band past the largest snap point stops near 23px", () => {
    const ios = { ...config, physics: sheetPhysics.ios }
    const { effects } = run([down(200), move(190, 8), move(-2000, 400)], {
      from: initialState(800, 1),
      config: ios,
    })
    const shown = (effects.at(-1) as { extent: number }).extent - 800
    expect(shown).toBeGreaterThan(20)
    expect(shown).toBeLessThan(24)
  })
})
