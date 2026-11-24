// Everything that follows a sheet's position besides the sheet itself: the
// backdrop's dim, the sheet's own progress variables, outlets like the page
// behind it, the sheets it's stacked on, and the browser's theme color.
//
// Three paths, so the main thread never writes effects frame by frame while
// the sheet moves on its own (on an iPhone, that makes the open stutter):
// - a finger drives the frame: `apply(extent)` writes once per frame;
// - the sheet settles on its own: `play(motion)` hands each curve to WAAPI as
//   a `linear()` easing sampled from the same spring, started at the same
//   time as the sheet, so it runs with no script per frame;
// - a scroll-snap sheet at rest: `follow(timeline)` ties the same curves to
//   the scroller's ScrollTimeline, so effects track native scrolling.
// At rest every value is written inline, and no animation is left holding it.
import { dimAmount, expandAmount, progressAmount } from "../motion/curves"
import { ahead } from "../platform/style"

/**
 * Keyframes for an element that follows a sheet, like `{ scale: [1, 0.94] }`. Index 0 is closed, the last is fully expanded.
 * @stable
 */
type SheetKeyframes = Record<string, (string | number)[]>

/** Something that follows the sheet besides the backdrop: an element and the keyframes it plays. */
type SheetOutlet = { el: HTMLElement; keyframes?: SheetKeyframes }

/** The sheet moving without a finger: a settle in time, or native scrolling on a timeline. */
type SheetMotion =
  | {
      type: "settle"
      extentAt: (elapsed: number) => number
      /** When it starts. An open moves it to the sheet's first frame later (see `sync`). */
      startTime: number
      duration: number
    }
  | {
      type: "timeline"
      timeline: AnimationTimeline
      extentAt: (progress: number) => number
    }

type Values = { dim: number; progress: number; expand: number }

const sampleStep = 1000 / 60

// Registered as numbers that don't inherit, so WAAPI can animate them and a
// change restyles only the element that has them.
const variables = [
  "--drawer-progress",
  "--drawer-dim",
  "--drawer-expand",
  "--drawer-stack",
]

const registered = new WeakSet<Document>()

function registerVariables(doc: Document) {
  const css = doc.defaultView?.CSS
  if (registered.has(doc) || !css?.registerProperty) {
    return
  }
  registered.add(doc)
  for (const name of variables) {
    try {
      css.registerProperty({
        name,
        syntax: "<number>",
        inherits: false,
        initialValue: "0",
      })
    } catch {
      // Already registered, by another copy of the package or the app's own @property.
    }
  }
}

// Registering restyles the whole page, so it's done ahead of the first sheet.
function prepareVariables() {
  if (typeof document !== "undefined" && !registered.has(document)) {
    ahead(() => registerVariables(document))
  }
}

// Safari before 17.2 has no `linear()` easing, and animating with one throws.
const supportsLinear = () =>
  typeof CSS !== "undefined" &&
  CSS.supports("animation-timing-function", "linear(0, 1)")

const round = (value: number) => Math.round(value * 10_000) / 10_000

function createSheetEffects(targets: {
  sheet: HTMLElement
  backdrop: () => HTMLElement | undefined
  // An element whose own `::backdrop` dims instead of a backdrop element, like
  // the viewport a popup presented as a sheet sits in.
  dimmed?: HTMLElement
  outlets: () => readonly SheetOutlet[]
  // Sheets this one is stacked on, nearest first.
  ancestors: () => readonly HTMLElement[]
  // Writes the browser's theme color for a dim amount, or nothing when off.
  themeColor?: (dim: number) => void
}) {
  registerVariables(targets.sheet.ownerDocument)
  let snapExtents: readonly number[] = [1]
  let undimmedIndex = -1
  let running: Animation[] = []
  const seeking = new Map<HTMLElement, Animation>()
  const values: Values = { dim: 0, progress: 0, expand: 0 }
  // A `::backdrop` has no inline style, so its resting dim is a paused
  // animation, created once and seeked. Being the oldest animation on the
  // element, it sits beneath every settle that plays over it.
  let dimHold: Animation | undefined

  function configure(next: {
    snapExtents: readonly number[]
    undimmedIndex: number
  }) {
    snapExtents = next.snapExtents.length ? next.snapExtents : [1]
    undimmedIndex = next.undimmedIndex
  }

  function compute(extent: number, into: Values = values) {
    into.dim = round(dimAmount(extent, snapExtents, undimmedIndex))
    into.progress = round(progressAmount(extent, snapExtents))
    into.expand = round(expandAmount(extent, snapExtents))
    return into
  }

  let destroyed = false

  function apply(extent: number, { rest = false } = {}) {
    if (destroyed) {
      return
    }
    stopRunning()
    compute(extent)
    writeDim(values.dim)
    writeVariables(targets.sheet, values)
    writeStack(values.progress)
    for (const outlet of targets.outlets()) {
      writeVariables(outlet.el, values)
      if (outlet.keyframes) {
        seekOutlet(outlet, values.expand, rest)
      }
    }
    if (rest) {
      targets.themeColor?.(values.dim)
    }
  }

  function writeDim(dim: number) {
    const backdrop = targets.backdrop()
    if (backdrop) {
      backdrop.style.opacity = String(dim)
    }
    const hold = holdDim()
    if (hold) {
      hold.currentTime = dim * 1000
    }
  }

  function holdDim() {
    if (!targets.dimmed || dimHold) {
      return dimHold
    }
    dimHold = targets.dimmed.animate(
      { opacity: [0, 1] },
      { ...backdropDim, duration: 1000, fill: "both" }
    )
    dimHold.pause()
    dimHold.currentTime = 0
    return dimHold
  }

  function writeStack(progress: number) {
    const ancestors = targets.ancestors()
    for (let depth = 0; depth < ancestors.length; depth++) {
      ancestors[depth].style.setProperty(
        "--drawer-stack",
        String(depth + progress)
      )
    }
  }

  function writeVariables(el: HTMLElement, { dim, progress, expand }: Values) {
    el.style.setProperty("--drawer-progress", String(progress))
    el.style.setProperty("--drawer-dim", String(dim))
    el.style.setProperty("--drawer-expand", String(expand))
  }

  function seekOutlet(outlet: SheetOutlet, amount: number, rest: boolean) {
    let animation = seeking.get(outlet.el)
    if (!animation) {
      animation = outlet.el.animate(asKeyframes(outlet.keyframes!), {
        duration: 1000,
        fill: "both",
      })
      animation.pause()
      seeking.set(outlet.el, animation)
    }
    animation.currentTime = amount * 1000
    if (!rest) {
      return
    }
    animation.commitStyles?.()
    animation.cancel()
    seeking.delete(outlet.el)
  }

  function play(motion: SheetMotion) {
    if (destroyed) {
      return
    }
    stopRunning()
    stopSeeking()
    if (!supportsLinear()) {
      return apply(
        motion.type === "settle" ? motion.extentAt(motion.duration) : 0,
        { rest: true }
      )
    }
    const samples = sampleCurves(motion)
    holdDim()
    const timing =
      motion.type === "settle"
        ? { duration: Math.max(1, motion.duration), fill: "both" as const }
        : { timeline: motion.timeline, fill: "both" as const }
    const animate = (
      el: HTMLElement,
      keyframes: Keyframe[] | PropertyIndexedKeyframes,
      curve: number[],
      pseudo?: typeof backdropDim
    ) => {
      const animation = el.animate(keyframes, {
        ...timing,
        ...pseudo,
        easing: easing(curve),
      })
      if (motion.type === "settle") {
        animation.startTime = motion.startTime
      }
      running.push(animation)
    }
    const backdrop = targets.backdrop()
    if (backdrop) {
      animate(backdrop, { opacity: [0, 1] }, samples.dim)
    }
    if (targets.dimmed) {
      animate(targets.dimmed, { opacity: [0, 1] }, samples.dim, backdropDim)
    }
    animateVariables(targets.sheet, samples, animate)
    targets
      .ancestors()
      .forEach((el, depth) =>
        animate(el, { "--drawer-stack": [depth, depth + 1] }, samples.progress)
      )
    for (const outlet of targets.outlets()) {
      animateVariables(outlet.el, samples, animate)
      if (outlet.keyframes) {
        animate(outlet.el, asKeyframes(outlet.keyframes), samples.expand)
      }
    }
    if (motion.type !== "settle") {
      return
    }
    const end = motion.extentAt(motion.duration)
    writeRest(end)
    const batch = running
    if (batch[0]) {
      batch[0].onfinish = () => running === batch && stopRunning()
    }
  }

  function animateVariables(
    el: HTMLElement,
    samples: Record<keyof Values, number[]>,
    animate: (
      el: HTMLElement,
      keyframes: PropertyIndexedKeyframes,
      curve: number[]
    ) => void
  ) {
    animate(el, { "--drawer-progress": [0, 1] }, samples.progress)
    animate(el, { "--drawer-dim": [0, 1] }, samples.dim)
    animate(el, { "--drawer-expand": [0, 1] }, samples.expand)
  }

  function writeRest(extent: number) {
    const end = compute(extent, { dim: 0, progress: 0, expand: 0 })
    writeDim(end.dim)
    writeVariables(targets.sheet, end)
    writeStack(end.progress)
    for (const outlet of targets.outlets()) {
      writeVariables(outlet.el, end)
      if (!outlet.keyframes) {
        continue
      }
      for (const [property, frames] of Object.entries(outlet.keyframes)) {
        const value = frames[end.expand >= 0.5 ? frames.length - 1 : 0]
        outlet.el.style.setProperty(cssName(property), String(value))
      }
    }
    targets.themeColor?.(end.dim)
  }

  function sampleCurves(motion: SheetMotion) {
    const curves = {
      dim: [] as number[],
      progress: [] as number[],
      expand: [] as number[],
    }
    const point: Values = { dim: 0, progress: 0, expand: 0 }
    const count =
      motion.type === "settle"
        ? Math.max(2, Math.ceil(motion.duration / sampleStep) + 1)
        : 61
    for (let index = 0; index < count; index++) {
      const at = index / (count - 1)
      const extent =
        motion.type === "settle"
          ? motion.extentAt(Math.min(motion.duration, index * sampleStep))
          : motion.extentAt(at)
      compute(extent, point)
      curves.dim.push(point.dim)
      curves.progress.push(point.progress)
      curves.expand.push(point.expand)
    }
    return curves
  }

  // An open moved to the sheet's first drawn frame: every effect starts with it.
  function sync(startTime: number) {
    for (const animation of running) {
      animation.startTime = startTime
    }
  }

  function stopRunning() {
    if (!running.length) {
      return
    }
    for (const animation of running) {
      animation.cancel()
    }
    running = []
  }

  function stopSeeking() {
    for (const animation of seeking.values()) {
      animation.cancel()
    }
    seeking.clear()
  }

  // Puts every element back as it was before the sheet opened.
  function destroy() {
    destroyed = true
    stopRunning()
    stopSeeking()
    targets.backdrop()?.style.removeProperty("opacity")
    dimHold?.cancel()
    for (const name of variables.slice(0, 3)) {
      targets.sheet.style.removeProperty(name)
    }
    for (const outlet of targets.outlets()) {
      for (const name of variables.slice(0, 3)) {
        outlet.el.style.removeProperty(name)
      }
      for (const property of Object.keys(outlet.keyframes ?? {})) {
        outlet.el.style.removeProperty(cssName(property))
      }
    }
  }

  return {
    configure,
    compute,
    apply,
    play,
    sync,
    follow: play,
    stop: stopRunning,
    destroy,
  }
}

type SheetEffects = ReturnType<typeof createSheetEffects>

const backdropDim = { pseudoElement: "::backdrop" }

function easing(curve: number[]) {
  return `linear(${curve.map(round).join(", ")})`
}

const asKeyframes = (keyframes: SheetKeyframes) =>
  keyframes as PropertyIndexedKeyframes

function cssName(property: string) {
  return property.startsWith("--")
    ? property
    : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

export {
  createSheetEffects,
  prepareVariables,
  type SheetEffects,
  type SheetKeyframes,
  type SheetMotion,
  type SheetOutlet,
  supportsLinear,
}
