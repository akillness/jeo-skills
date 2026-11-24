import { trusted } from "./trusted"

let modality: "keyboard" | "pointer" = "pointer"
let installed = false
// Whether `trackInput` has an install waiting on a microtask.
let scheduled = false
let restoring = false
let moving = false
// Whether the window lost focus since the last key or pointer press. The
// browser focuses the same element again when the user comes back, and that
// isn't keyboard use either.
let windowLeft = false
// The kind of the last pointer that pressed, for clicks that don't carry one.
// "virtual" is a press a screen reader made up.
let lastPointer: "mouse" | "touch" | "pen" | "virtual" = "mouse"
// A pointer press in the current task, which the touch event after it repeats.
let pointerPressed = false
const forgetPointerPress = () => (pointerPressed = false)
// Where Enter or Space was pressed in the current task. A button turns that
// key into a click with no pointer behind it.
let keyTarget: Node | null = null
const forgetKeyTarget = () => (keyTarget = null)

// Enter and Space on a button click it, Space on release, so both key events count.
function noteKey(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") {
    return
  }
  keyTarget = event.target as Node
  setTimeout(forgetKeyTarget)
}

function noteKeydown(event: KeyboardEvent) {
  noteKey(event)
  windowLeft = false
  // Modifier keys alone, like Command held for a click, aren't keyboard use.
  // Tab always is, even with Option held, which Safari needs to reach buttons.
  const modifierOnly =
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    /^(Meta|Control|Alt|Shift)$/.test(event.key)
  if (event.key === "Tab" || !modifierOnly) {
    modality = "keyboard"
  }
}

// Some engines send a tap as touch events and a click, without pointer events,
// so a touchstart counts as a touch press too.
function notePress(event: PointerEvent | TouchEvent) {
  modality = "pointer"
  windowLeft = false
  if (!("pointerType" in event)) {
    if (!pointerPressed) {
      lastPointer = "touch"
    }
    return
  }
  pointerPressed = true
  setTimeout(forgetPointerPress)
  const type = event.pointerType
  lastPointer = isSyntheticPointer(event)
    ? "virtual"
    : type === "touch" || type === "pen"
      ? type
      : "mouse"
}

function install() {
  if (installed || typeof document === "undefined") {
    return
  }
  installed = true
  document.addEventListener("keydown", noteKeydown, true)
  document.addEventListener("keyup", noteKey, true)
  document.addEventListener("pointerdown", notePress, true)
  document.addEventListener("touchstart", notePress, {
    capture: true,
    passive: true,
  })
  window.addEventListener("blur", (event) => {
    if (event.target === window) {
      windowLeft = true
    }
  })
}

/**
 * Starts tracking input, so later changes can tell how they were caused. A
 * microtask later, before any key or pointer press can come, so a primitive
 * that calls it as it's made reads no `document` then, as on a server. Safe
 * to call often.
 */
function trackInput() {
  if (installed || scheduled) {
    return
  }
  scheduled = true
  queueMicrotask(install)
}

// A pointer with no size and no pressure is one assistive technology made up,
// like VoiceOver's double tap on iOS, rather than a finger or a mouse.
// TalkBack's double tap on Android comes as a one-pixel mouse with no pressure
// and no click count, which no real mouse sends: their pressure is 0.5.
function isSyntheticPointer(event: PointerEvent) {
  if (event.type === "pointermove") {
    return false
  }
  if (event.width === 0 && event.height === 0 && event.pressure === 0) {
    return true
  }
  return (
    event.pointerType === "mouse" &&
    event.width === 1 &&
    event.height === 1 &&
    event.pressure === 0 &&
    event.detail === 0
  )
}

// A click carries no pointer type every engine agrees on. One after a press
// takes the press's kind. One with no press behind it came from Enter or Space
// on the element, or else from something virtual.
function clickSource(event: MouseEvent) {
  if (event.detail > 0) {
    return lastPointer
  }
  const fromKey = !!keyTarget && keyTarget.contains(event.target as Node | null)
  return fromKey ? "keyboard" : "virtual"
}

// How the user is working now, by their last key or pointer press.
const currentSource = () => (modality === "keyboard" ? "keyboard" : lastPointer)

/**
 * How an event came about: a mouse, a finger, a pen or the keyboard. A click
 * with no pointer or key behind it is `"virtual"`, which may be assistive
 * technology. An event a script dispatched, like `el.click()`, is `"programmatic"`.
 * Without an event, how the user is working now, by their last key or pointer
 * press: `sourceOf() === "keyboard"` while they use the keyboard.
 * @stable
 */
function sourceOf(event?: Event) {
  install()
  if (!event) {
    return currentSource()
  }
  if (!trusted(event)) {
    return "programmatic"
  }
  if (event.type.startsWith("key")) {
    return "keyboard"
  }
  if (event.type.startsWith("touch")) {
    return "touch"
  }
  if (event.type === "click") {
    return clickSource(event as MouseEvent)
  }
  const pointerType = (event as PointerEvent).pointerType
  if (
    pointerType === "mouse" ||
    pointerType === "touch" ||
    pointerType === "pen"
  ) {
    return isSyntheticPointer(event as PointerEvent) ? "virtual" : pointerType
  }
  // Other mouse events take the kind of the last press. A property check, not
  // `instanceof MouseEvent`, works without a DOM and for events from other frames.
  if ("button" in event) {
    return lastPointer
  }
  return currentSource()
}

/**
 * Whether the focus that just moved came from the keyboard, rather than a
 * pointer, a popup moving it in or back, or the window getting focus back.
 * @stable
 */
function isFocusFromKeyboard() {
  install()
  return modality === "keyboard" && !restoring && !moving && !windowLeft
}

// Moves focus back after a popup closed, marked as a restoration while it happens.
function restoreFocus(el: HTMLElement) {
  install()
  restoring = true
  try {
    el.focus({ preventScroll: true })
  } finally {
    restoring = false
  }
}

// Moves focus into a popup that's opening, marked so a tooltip on the element
// it lands on stays closed: the user opened the popup, not the tooltip.
function moveFocus(el: HTMLElement) {
  install()
  moving = true
  try {
    el.focus({ preventScroll: true })
  } finally {
    moving = false
  }
}

// The modality a popup starts in, from how it opened. Anything but a pointer,
// like a key or a screen reader's virtual click, counts as the keyboard.
const modalityOf = (opener: string) =>
  opener === "pointer" || opener === "touch"
    ? ("pointer" as const)
    : ("keyboard" as const)

// Writes data-modality, "keyboard" or "pointer", on a popup for how the user
// works in it now, so highlighted items can be styled by it. Virtual focus
// never matches :focus-visible, so this is the hook. It starts from how the
// popup opened, then follows key presses on the popup or `keys` (like a
// combobox input that keeps focus), and pointer presses or moves of more than
// 2px on the popup. Returns a cleanup.
function trackModality(
  el: HTMLElement,
  initial: "keyboard" | "pointer",
  keys: () => (HTMLElement | undefined)[] = () => []
) {
  let current = initial
  let last: { x: number; y: number } | undefined
  const write = (next: "keyboard" | "pointer") => {
    current = next
    if (el.getAttribute("data-modality") !== next) {
      el.setAttribute("data-modality", next)
    }
  }
  write(initial)
  const onKey = (event: KeyboardEvent) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      /^(Meta|Control|Alt|Shift)$/.test(event.key)
    ) {
      return
    }
    write("keyboard")
  }
  const onDown = () => write("pointer")
  const onMove = (event: PointerEvent) => {
    const point = { x: event.clientX, y: event.clientY }
    const moved = last && Math.hypot(point.x - last.x, point.y - last.y) > 2
    last = point
    if (moved && current !== "pointer") {
      write("pointer")
    }
  }
  const targets = [
    el,
    ...keys().filter((target): target is HTMLElement => !!target),
  ]
  for (const target of targets) {
    target.addEventListener("keydown", onKey, true)
  }
  el.addEventListener("pointerdown", onDown, true)
  el.addEventListener("pointermove", onMove, true)
  return () => {
    for (const target of targets) {
      target.removeEventListener("keydown", onKey, true)
    }
    el.removeEventListener("pointerdown", onDown, true)
    el.removeEventListener("pointermove", onMove, true)
    el.removeAttribute("data-modality")
  }
}

export {
  isFocusFromKeyboard,
  modalityOf,
  moveFocus,
  restoreFocus,
  sourceOf,
  trackInput,
  trackModality,
}
