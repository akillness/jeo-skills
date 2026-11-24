// The boundary every web sheet driver implements. A driver owns the sheet's
// motion and its input, and feeds the shared machine; `attachSheet` owns
// everything else (geometry, effects, modality, focus) and hears back through
// these callbacks. Swapping drivers changes how the sheet moves, nothing else.
import type { SheetConfig, SheetSnapReason } from "../motion/machine"
import { setStyle } from "../platform/style"
import type { PhysicalSide } from "../platform/sides"
import type { SheetMotion } from "./sheet-effects"

/**
 * How a sheet's motion is driven. `"auto"` picks scroll snap for a bottom sheet on a touch screen, and the pointer driver otherwise.
 * @stable
 */
type SheetDriverName = "pointer" | "scroll-snap" | "auto"

type SheetDriverOptions = {
  /** The moving surface. */
  sheet: HTMLElement
  /** The full-screen element the sheet sits in, in the top layer. */
  host: HTMLElement
  side: () => PhysicalSide
  /** The machine's geometry and physics, read on every event. */
  config: () => SheetConfig
  /** The sheet's own size along its axis, measured at the last layout. */
  size: () => number
  /** Where a closed sheet sits: just past the edge, below Safari's floating toolbar for a bottom sheet. */
  closedExtent: () => number
  reducedMotion: () => boolean
  /** Whether this sheet, and not one stacked above it, owns a press on `target`. */
  owns: (target: EventTarget | null) => boolean
  /** Whether a press on `target` may start a mouse drag, like on the handle or empty space. */
  canMouseDrag: (target: Element) => boolean
  /** The resting snap point changes, at release or when a programmatic move starts. */
  onSnap: (id: string, reason: SheetSnapReason, event?: Event) => void
  /** The sheet came to rest on a snap point, or closed (null). */
  onRest: (id: string | null) => void
  /** A swipe dismissed the sheet; it's already settling closed. */
  onDismiss: (event?: Event) => void
  /** A swipe tried to dismiss a sheet that can't be dismissed. */
  onDismissAttempt: (event?: Event) => void
  onDragChange: (dragging: boolean) => void
  /** Whether resting at a snap point leaves the page usable, so presses beside the sheet reach it. */
  isInteractive: (id: string) => boolean
  /** A frame a finger drove, after the sheet moved. Effects follow it. */
  onFrame: (extent: number) => void
  /** The sheet started moving on its own. Effects play the same motion. */
  onMotion: (motion: SheetMotion) => void
  /** A motion that waited for the sheet's first frame started, at this time. */
  onMotionStart: (startTime: number) => void
}

type SheetDriver = {
  /** Shows the sheet at a snap point: rising from closed, or there at once. */
  open: (id: string, animate: boolean) => void
  /** Settles closed. Its animation is on the sheet, so presence waits for it. */
  close: () => void
  snapTo: (id: string, reason: SheetSnapReason) => void
  /** A refused dismissal: a small push toward closing that springs back. */
  nudge: () => void
  /**
   * The geometry changed: keep the resting snap point and move to its new
   * extent, at once when `immediate`. If that point is gone, `fallback`, or
   * else the nearest.
   */
  relayout: (immediate: boolean, fallback?: string) => void
  /** The snap point it rests on or is settling to, or null when closed or closing. */
  target: () => string | null
  /** Whether a gesture or a settle is in progress. */
  isMoving: () => boolean
  destroy: () => void
}

// An open starts on the sheet's first drawn frame, not at a time picked in
// advance. The frame that builds the sheet can be long: a start time from
// before it skips the rise's first frames, which makes opens stutter on an
// iPhone, and a fixed delay either waits too long or not
// long enough. So the open's animation is created at once, held closed by a
// start time this far ahead, and moved to the time of the sheet's first drawn
// frame by `afterFirstFrame`.
const openHold = 1000

// Runs `start` with the time of the frame after the sheet's first: the first
// animation frame callback runs before that frame's style and layout. Callers
// check the open is still the motion in progress, so a late frame after a newer
// motion or a destroy does nothing.
function afterFirstFrame(view: Window, start: (frameTime: number) => void) {
  view.requestAnimationFrame(() => view.requestAnimationFrame(start))
}

// Below Safari's floating toolbar on iOS 26 the page still draws, 98pt on a
// 402×874 iPhone. A closed bottom sheet goes this far past the layout
// viewport's bottom so it never shows there. Other sides only need to clear a shadow.
const toolbarBleed = 120

function closedExtentFor(side: PhysicalSide) {
  return side === "bottom" ? -toolbarBleed : -32
}

// A settle as one `translate` keyframe per frame, for a browser without
// `linear()` and for a distance too short for an easing to carry.
function sampleTranslate(
  motion: { duration: number; extentAt: (elapsed: number) => number },
  translate: (extent: number) => string
) {
  const frames: string[] = []
  for (let elapsed = 0; elapsed < motion.duration; elapsed += 1000 / 60) {
    frames.push(translate(motion.extentAt(elapsed)))
  }
  frames.push(translate(motion.extentAt(motion.duration)))
  return frames
}

// A sheet settles in this long under reduced motion, without overshoot, and
// opens and closes with a fade this long.
const reducedSettle = 200
const reducedFade = 150

// Sets inline styles and returns a function that puts back what was there,
// property by property, unless something else changed it since.
function setStyles(el: HTMLElement, styles: Record<string, string>) {
  const restores = Object.entries(styles).map(([name, value]) =>
    setStyle(el, name, value)
  )
  return () => restores.forEach((restore) => restore())
}

export {
  afterFirstFrame,
  closedExtentFor,
  openHold,
  reducedFade,
  reducedSettle,
  sampleTranslate,
  setStyles,
  type SheetDriver,
  type SheetDriverName,
  type SheetDriverOptions,
  toolbarBleed,
}
