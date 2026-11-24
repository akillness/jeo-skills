// How a sheet moves, as one object of numbers, so tuning it against a device
// never touches code. `ios` is fitted to iOS 26.5 system sheets recorded
// frame by frame in the simulator.

/**
 * The numbers behind a sheet's motion. Every driver reads the same preset.
 * @stable
 */
type SheetPhysics = {
  /** Spring period in seconds, for releases without momentum and for programmatic moves. */
  response: number
  /** Damping ratio for releases without momentum and programmatic moves. 1 never overshoots. */
  dampingRatio: number
  /** Damping ratio once a release carries momentum, which lets it overshoot a little. */
  momentumDampingRatio: number
  /** Per-millisecond deceleration used to project where a fling would stop. */
  projectionRate: number
  /** Below this speed, in px per ms, a release settles on the nearest snap point. */
  minFlingVelocity: number
  /** Whether a fast fling can pass over snap points. */
  skipSnapPoints: boolean
  /** The rubber band's coefficient, past the largest snap point or a refused dismissal. */
  rubberBand: number
  /** The most the rubber band can stretch, in px, or null for the container's size. */
  rubberBandDimension: number | null
  /** Travel, in px, before a touch or pen drag moves the sheet. */
  touchSlop: number
  /** Travel, in px, before a mouse drag moves the sheet. */
  mouseSlop: number
  /** How dark `themeColor` makes the browser's theme color, as the opacity of black. */
  dim: number
  /** How far back, in ms, the release velocity looks at input samples. */
  velocityHorizon: number
}

/**
 * Physics presets. `ios` is the default everywhere.
 * @stable
 */
const sheetPhysics = {
  ios: {
    response: 0.34,
    dampingRatio: 1,
    momentumDampingRatio: 0.88,
    projectionRate: 0.99,
    minFlingVelocity: 0.5,
    skipSnapPoints: true,
    // UIKit's sheet band stops near 23pt: d 24, c 1.9 fit the recording.
    rubberBand: 1.9,
    rubberBandDimension: 24,
    touchSlop: 8,
    mouseSlop: 4,
    dim: 0.2,
    velocityHorizon: 70,
  } satisfies SheetPhysics as SheetPhysics,
}

export { sheetPhysics, type SheetPhysics }
