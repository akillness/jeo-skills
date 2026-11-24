// Enter and exit animations without a framework. The popup gets
// data-starting-style for its first frame and data-ending-style while it
// animates out. Unmounting waits for every running animation, with a timeout
// from the computed durations so an infinite or stuck animation cannot block it.
import { measured } from "#dev"

const pendingResets = new WeakMap<HTMLElement, () => void>()

/**
 * Starts an element's enter animation: `data-starting-style` for its first
 * frame, so CSS transitions from it. `done` runs once the animation has
 * finished, for parts that hold a measured size while animating. Returns a
 * cleanup that stops it.
 * @stable
 */
function animateIn(el: HTMLElement, done?: () => void) {
  pendingResets.get(el)?.()
  // An element already shown would transition to its starting style and back,
  // so it jumps there with what's inside it, like an icon's path. Anything
  // already moving eases back instead. jsdom has no getAnimations.
  const running = el.getAnimations?.({ subtree: true }).filter(isTransition)
  const settled = running?.every((animation) => targetOf(animation) !== el)
  el.setAttribute("data-starting-style", "")
  if (running && settled) {
    for (const animation of el.getAnimations({ subtree: true })) {
      if (
        isTransition(animation) &&
        !running.some((moving) => continues(animation, moving))
      ) {
        animation.finish()
      }
    }
  }
  let stopWaiting: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const frame = requestAnimationFrame(
    () =>
      (timer = setTimeout(() => {
        el.removeAttribute("data-starting-style")
        if (done) {
          stopWaiting = whenFinished(el, done)
        }
      }))
  )
  return () => {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
    stopWaiting?.()
    el.removeAttribute("data-starting-style")
  }
}

const isTransition = (animation: Animation): animation is CSSTransition =>
  "transitionProperty" in animation

const targetOf = (animation: Animation) =>
  (animation.effect as KeyframeEffect | null)?.target

const continues = (animation: CSSTransition, moving: CSSTransition) =>
  targetOf(animation) === targetOf(moving) &&
  animation.transitionProperty === moving.transitionProperty

function seconds(value: string) {
  return value.split(",").map((part) => {
    // An element outside the page reports no duration at all.
    const number = parseFloat(part) || 0
    return part.trim().endsWith("ms") ? number / 1000 : number
  })
}

// The longest transition or one iteration of the longest animation, in ms,
// on the element or its ::backdrop, which a popup in the top layer animates too.
function longest(el: HTMLElement) {
  return Math.max(
    durationOf(getComputedStyle(el)),
    durationOf(getComputedStyle(el, "::backdrop"))
  )
}

function durationOf(style: CSSStyleDeclaration) {
  const pairs = (durations: string, delays: string, iterations = "1") => {
    const d = seconds(durations)
    const l = seconds(delays)
    const n = iterations
      .split(",")
      .map((part) => (part.trim() === "infinite" ? 1 : parseFloat(part) || 1))
    return d.map(
      (duration, index) =>
        (duration * (n[index % n.length] ?? 1) + (l[index % l.length] ?? 0)) *
        1000
    )
  }
  return Math.max(
    0,
    ...pairs(style.transitionDuration, style.transitionDelay),
    ...pairs(
      style.animationDuration,
      style.animationDelay,
      style.animationIterationCount
    )
  )
}

// How long, in ms, until the last of these animations ends. Script animations,
// like a sheet's spring, have no CSS duration to read, so their own timing
// counts. Infinite ones are left to the CSS fallback.
function remaining(animations: Animation[]) {
  let longestLeft = 0
  for (const animation of animations) {
    const timing = animation.effect?.getComputedTiming()
    const end = Number(timing?.endTime)
    if (!timing || !Number.isFinite(end)) {
      continue
    }
    longestLeft = Math.max(longestLeft, end - (Number(timing.localTime) || 0))
  }
  return longestLeft
}

// A scroll-driven animation runs on its scroller's timeline, so it has no end in time.
const onClock = (animation: Animation) =>
  !animation.timeline || !("source" in animation.timeline)

function whenFinished(el: HTMLElement, done: () => void) {
  let finished = false
  // Reading animations flushes styles, so transitions just triggered are included.
  const animations = el.getAnimations({ subtree: true }).filter(onClock)
  const finish = () => {
    if (finished) {
      return
    }
    finished = true
    clearTimeout(timer)
    done()
  }
  const timer = animations.length
    ? setTimeout(finish, Math.max(longest(el), remaining(animations)) + 50)
    : undefined
  if (!animations.length) {
    measured(finish)
  } else {
    Promise.allSettled(animations.map((animation) => animation.finished)).then(
      finish
    )
  }
  return () => {
    finished = true
    clearTimeout(timer)
  }
}

/**
 * Writes `data-open` or `data-closed` now, ahead of the framework's render,
 * which writes the same one. Exit keyframes keyed on `[data-closed]` are then
 * running when `animateOut` reads them.
 */
function writeOpen(el: HTMLElement, open: boolean) {
  el.toggleAttribute("data-open", open)
  el.toggleAttribute("data-closed", !open)
}

/**
 * Plays an element's exit animation: `data-ending-style` and `inert` while
 * it animates out, then `done`, once every running animation has finished or
 * a timeout from the computed durations has passed. Unmount the element in
 * `done`: after an animation it keeps `data-ending-style` until then, and
 * loses it and `inert` two frames later if it stays mounted. Returns a
 * cleanup that stops it.
 * @stable
 */
function animateOut(el: HTMLElement, done: () => void) {
  pendingResets.get(el)?.()
  el.removeAttribute("data-starting-style")
  el.setAttribute("data-ending-style", "")
  const wasInert = el.hasAttribute("inert")
  el.setAttribute("inert", "")
  // An owner that writes `inert` during the exit, like `inert={!open}` on a panel
  // kept mounted, keeps what it wrote.
  const Observer = el.ownerDocument?.defaultView?.MutationObserver
  let written = false
  const owner = Observer && new Observer(() => (written = true))
  owner?.observe(el, { attributeFilter: ["inert"] })
  let frame = 0
  const reset = () => {
    cancelAnimationFrame(frame)
    pendingResets.delete(el)
    el.removeAttribute("data-ending-style")
    written ||= !!owner?.takeRecords().length
    owner?.disconnect()
    if (!written) {
      el.toggleAttribute("inert", wasInert)
    }
  }
  let isAnimating = false
  // Frameworks unmount on their next render, and CSS keyed on the ending style
  // would show the open look until then. A frame requested as animations
  // finish can still run before this frame's paint, hence two.
  const stop = whenFinished(el, () => {
    if (!isAnimating) {
      reset()
      return done()
    }
    pendingResets.set(el, reset)
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(reset)
    })
    done()
  })
  // Without animations `done` ran already, before anything painted the ending style.
  isAnimating = true
  return () => {
    stop()
    reset()
  }
}

export { animateIn, animateOut, writeOpen }
