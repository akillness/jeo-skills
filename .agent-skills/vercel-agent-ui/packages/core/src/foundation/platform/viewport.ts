// What a phone's screen leaves for the page: the on-screen keyboard over the
// layout viewport's bottom, the visual viewport iOS pans to keep a field in
// view, and the safe areas around a notch or home indicator.

import {
  followViewport,
  keyboardHeight,
  keyboardInset,
  measureViewport,
  type ViewportSize,
} from "./keyboard"

/**
 * What `bindViewport` reports, in CSS pixels.
 * @experimental
 */
type ViewportState = {
  /** The on-screen keyboard's height while a field has focus, zoomed in or not. 0 without one. */
  keyboard: number
  /** How much of the layout viewport's bottom the keyboard covers: less while iOS pans the page, and 0 when the browser resizes the page instead. */
  keyboardInset: number
  /** The visual viewport's width: what's on screen. */
  width: number
  /** The visual viewport's height: what's on screen, above the keyboard. */
  height: number
  /** How far the visual viewport is scrolled down the layout viewport, like when iOS pans a focused field into view. */
  offsetTop: number
  /** How far the visual viewport is scrolled across the layout viewport. */
  offsetLeft: number
  /** The pinch-zoom scale, 1 when not zoomed. */
  scale: number
  /** The safe-area insets around a notch, rounded corners or a home indicator. All 0 without `viewport-fit=cover`. */
  safeArea: { top: number; right: number; bottom: number; left: number }
}

const sides = ["top", "right", "bottom", "left"] as const

// `env()` can't be read from script, so a hidden element pads itself with it.
function safeAreaProbe(doc: Document) {
  const probe = doc.createElement("div")
  probe.setAttribute("aria-hidden", "true")
  probe.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;${sides
    .map((side) => `padding-${side}:env(safe-area-inset-${side},0px)`)
    .join(";")}`
  doc.body.append(probe)
  return probe
}

// The visual viewport, or the window where a browser has none.
function sizeOf(view: Window) {
  const visual = view.visualViewport
  if (visual) {
    return measureViewport(view, visual)
  }
  return {
    width: view.innerWidth,
    layoutHeight: view.innerHeight,
    height: view.innerHeight,
    offsetTop: 0,
    scale: 1,
  }
}

function safeAreaOf(view: Window, probe: HTMLElement) {
  const style = view.getComputedStyle(probe)
  const inset = (side: (typeof sides)[number]) =>
    Math.round(
      Number.parseFloat(style.getPropertyValue(`padding-${side}`)) || 0
    )
  return {
    top: inset("top"),
    right: inset("right"),
    bottom: inset("bottom"),
    left: inset("left"),
  }
}

type KeyboardFollower = (
  size: ViewportSize,
  keyboard: number,
  event?: Event
) => void

const keyboardByView = new WeakMap<
  Window,
  { followers: Set<KeyboardFollower>; height: number; stop: () => void }
>()

// Made apart from any follower, like `shareViewport`, so it never keeps one alive.
function shareKeyboard(view: Window) {
  const followers = new Set<KeyboardFollower>()
  const keyboard = keyboardHeight(view)
  const shared = { followers, height: 0, stop: () => {} }
  const notify = (size: ViewportSize, event: Event) => {
    const height = keyboard(size, event)
    shared.height = height
    for (const follow of followers) {
      follow(size, height, event)
    }
  }
  const measure = (event: Event) => notify(sizeOf(view), event)
  const visual = view.visualViewport
  const stopViewport = visual ? followViewport(view, visual, notify) : () => {}
  view.addEventListener("resize", measure)
  view.document.addEventListener("focusin", measure)
  view.document.addEventListener("focusout", measure)
  shared.stop = () => {
    stopViewport()
    view.removeEventListener("resize", measure)
    view.document.removeEventListener("focusin", measure)
    view.document.removeEventListener("focusout", measure)
    keyboardByView.delete(view)
  }
  shared.height = keyboard(sizeOf(view))
  keyboardByView.set(view, shared)
  return shared
}

// Every bindViewport and bindAvoidKeyboard on a window shares one set of
// listeners, which measure the viewport and the keyboard once per event.
function followKeyboard(view: Window, follower: KeyboardFollower) {
  const shared = keyboardByView.get(view) ?? shareKeyboard(view)
  const { followers, stop } = shared
  followers.add(follower)
  // A follower joining later hears the keyboard as it stands, without measuring
  // anew: between one field's blur and the next one's focus that would read the
  // page under an open keyboard as the page without one.
  follower(sizeOf(view), shared.height)
  return () => {
    if (followers.delete(follower) && !followers.size) {
      stop()
    }
  }
}

/**
 * Follows the viewport on `el`: `--keyboard-inset`, `--visual-viewport-width`,
 * `--visual-viewport-height` and `--visual-viewport-top`, plus `data-keyboard`
 * while the keyboard covers part of the page. `onChange` hears every change,
 * and once at the start. Returns a cleanup that removes what it wrote.
 * @experimental
 */
function bindViewport(
  el: HTMLElement,
  { onChange }: { onChange?: (viewport: ViewportState) => void } = {}
) {
  const doc = el.ownerDocument
  const view = doc.defaultView
  if (!view) {
    return () => {}
  }
  const probe = safeAreaProbe(doc)
  let safeArea = safeAreaOf(view, probe)
  let last = ""
  const write = (name: string, px: number) => {
    const value = `${px}px`
    if (el.style.getPropertyValue(name) !== value) {
      el.style.setProperty(name, value)
    }
  }
  const stop = followKeyboard(view, (size, keyboard, event) => {
    // Safe areas change only with the window's size, and reading them costs a style recalc.
    if (event?.type === "resize") {
      safeArea = safeAreaOf(view, probe)
    }
    const viewport: ViewportState = {
      keyboard,
      keyboardInset: keyboardInset(view, size, keyboard),
      width: Math.round(size.width),
      height: Math.round(size.height),
      offsetTop: Math.round(size.offsetTop),
      offsetLeft: Math.round(view.visualViewport?.offsetLeft ?? 0),
      scale: size.scale,
      safeArea,
    }
    write("--keyboard-inset", viewport.keyboardInset)
    write("--visual-viewport-width", viewport.width)
    write("--visual-viewport-height", viewport.height)
    write("--visual-viewport-top", viewport.offsetTop)
    el.toggleAttribute("data-keyboard", keyboard > 0)
    const key = JSON.stringify(viewport)
    if (key === last) {
      return
    }
    last = key
    onChange?.(viewport)
  })
  return () => {
    stop()
    probe.remove()
    for (const name of [
      "--keyboard-inset",
      "--visual-viewport-width",
      "--visual-viewport-height",
      "--visual-viewport-top",
    ]) {
      el.style.removeProperty(name)
    }
    el.removeAttribute("data-keyboard")
  }
}

// A translate's y as computed style keeps it, percentage and pixels apart,
// like "-50%", "12px" or "calc(-50% - 120px)".
function lengthOf(value: string) {
  const length = { percent: 0, px: 0 }
  for (const [, number = "0", unit] of value
    .replaceAll(" ", "")
    .matchAll(/([+-]?[\d.]+(?:e[+-]?\d+)?)(%|px)?/gi)) {
    length[unit === "%" ? "percent" : "px"] += Number.parseFloat(number)
  }
  return length
}

const cssLength = ({ percent, px }: { percent: number; px: number }) =>
  !percent
    ? `${px}px`
    : `calc(${percent}% ${px < 0 ? "-" : "+"} ${Math.abs(px)}px)`

/**
 * Keeps `el` above the on-screen keyboard, like a chat composer or a toolbar
 * at the bottom of the screen: while the keyboard is open, it lifts `el` by as
 * much of it as lies below what's on screen, through its `translate`, and sets
 * `data-keyboard`. Its own translate stays, percentages too, like a toolbar
 * centered with `-50%`. An element below the layout viewport stays put, and
 * scrolling the page or a container around `el` measures it again. Returns a
 * cleanup that puts `el`'s own `translate` back.
 * @experimental
 */
function bindAvoidKeyboard(el: HTMLElement) {
  const view = el.ownerDocument.defaultView
  const visual = view?.visualViewport
  if (!view || !visual) {
    return () => {}
  }
  const own = el.style.translate
  // The translate el has now, as shown: mid-transition, part of the way to the
  // lift. Its x and z stay as they're written; its y takes the lift.
  const shown = () => {
    const value = view.getComputedStyle(el).translate
    // Spaces inside calc() aren't between parts, so split outside parentheses only.
    const [x = "0px", y = "0px", z] =
      value === "none" ? [] : value.split(/ (?![^(]*\))/)
    return { x, y: lengthOf(y), z }
  }
  const rest = shown()
  // iOS measures boxes from the visual viewport while it's panned, others from
  // the layout viewport. A fixed element at the top is where the layout starts.
  const origin = el.ownerDocument.createElement("div")
  origin.setAttribute("aria-hidden", "true")
  origin.setAttribute("data-viewport-origin", "")
  origin.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none"
  el.ownerDocument.body.append(origin)
  // Where el would be without the lift, in the layout viewport the keyboard
  // covers, against where the visible part of the page ends.
  const covered = () => {
    const box = el.getBoundingClientRect()
    const now = shown().y
    const shift =
      now.px -
      rest.y.px +
      ((now.percent - rest.y.percent) * box.height) / 100 +
      origin.getBoundingClientRect().top
    const bottom = Math.min(box.bottom - shift, view.innerHeight)
    const below =
      box.top - shift < view.innerHeight
        ? bottom - visual.offsetTop - visual.height
        : 0
    return Math.round(Math.max(0, below))
  }
  let keyboard = 0
  let lifted = 0
  const update = () => {
    el.toggleAttribute("data-keyboard", keyboard > 0)
    const next = keyboard ? covered() : 0
    if (next === lifted) {
      return
    }
    lifted = next
    const y = cssLength({ percent: rest.y.percent, px: rest.y.px - lifted })
    el.style.translate = lifted
      ? [rest.x, y, rest.z].filter(Boolean).join(" ")
      : own
  }
  // Scrolling reports late and often, so it measures once a frame, as the page
  // paints, and only while the keyboard is open: closed, nothing is lifted.
  let frame = 0
  const scrolled = () => {
    if (!keyboard && !lifted) {
      return
    }
    view.cancelAnimationFrame(frame)
    frame = view.requestAnimationFrame(update)
  }
  const stop = followKeyboard(view, (_, height, event) => {
    keyboard = height
    if (event?.type === "scroll") {
      scrolled()
    } else {
      update()
    }
  })
  // A container's scroll doesn't bubble, so the window hears every one as it passes down.
  view.addEventListener("scroll", scrolled, { capture: true, passive: true })
  return () => {
    view.cancelAnimationFrame(frame)
    stop()
    view.removeEventListener("scroll", scrolled, { capture: true })
    origin.remove()
    el.style.translate = own
    el.removeAttribute("data-keyboard")
  }
}

export { bindAvoidKeyboard, bindViewport, type ViewportState }
