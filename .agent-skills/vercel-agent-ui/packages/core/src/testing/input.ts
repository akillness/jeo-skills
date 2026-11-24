// The event sequences a browser sends for a person's keys, typing, clicks,
// drags and hovers, in the order it sends them, marked as a person's so
// changes report the right source. A DOM made for tests has no Tab and no
// layout, so Tab follows tab order here and parts have boxes (`mount.ts`).
import { dragThreshold } from "../foundation/drag-and-drop/pointer"
import { trustSent } from "../foundation/kernel/trusted"
import { isRtl } from "./aria"

// The events this file sends, which core treats as a person's.
const sent = new WeakSet<Event>()
trustSent(sent)
function markTrusted<E extends Event>(event: E) {
  sent.add(event)
  return event
}

const focusable =
  "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]:not([contenteditable=false])"

/**
 * Waits for what a component schedules after rendering or an event: microtasks,
 * a timer and two frames. A tooltip's name and focus moving into a menu that
 * opened on a press both arrive this way. `mount`'s `view.settle()` is the same.
 *
 * @example
 * await user.click(screen.getByRole("button", { name: "Options" }))
 * await act(settle)
 * await checkPattern(screen.getByRole("menu"), "menu")
 *
 * @experimental
 */
async function settle() {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve()
  }
  await new Promise((resolve) => setTimeout(resolve))
  const frame = () =>
    new Promise((resolve) =>
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(resolve)
        : setTimeout(resolve, 16)
    )
  await frame()
  await frame()
}

// "Shift+Tab" is Tab with Shift held, and "Space" is " ".
function parseKey(name: string) {
  const parts = name.split("+")
  const key = parts.pop()!
  const held = new Set(parts.map((part) => part.toLowerCase()))
  return {
    key: key === "Space" ? " " : key,
    shiftKey: held.has("shift"),
    altKey: held.has("alt"),
    ctrlKey: held.has("control") || held.has("ctrl"),
    metaKey: held.has("meta") || held.has("cmd"),
  }
}

const codeOf = (key: string) =>
  key === " "
    ? "Space"
    : /^[a-z]$/i.test(key)
      ? `Key${key.toUpperCase()}`
      : /^\d$/.test(key)
        ? `Digit${key}`
        : key

function isEditable(
  el: Element | null
): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (!el) {
    return false
  }
  if (el instanceof HTMLTextAreaElement) {
    return !el.readOnly && !el.matches(":disabled")
  }
  if (el instanceof HTMLInputElement) {
    return (
      !el.readOnly &&
      !el.matches(":disabled") &&
      !/^(button|checkbox|radio|submit|reset|range|color|file|image)$/.test(
        el.type
      )
    )
  }
  return (el as HTMLElement).isContentEditable
}

// Tab skips what isn't rendered or can't be used, but not `aria-hidden`, as browsers do.
const isHidden = (el: Element) => !!el.closest("[hidden], [inert]")

// The elements Tab stops at, in order: positive tabindex first, then the page's order.
function tabOrder(doc: Document) {
  const stops = [...doc.querySelectorAll<HTMLElement>(focusable)].filter(
    (el) => el.tabIndex >= 0 && !el.matches(":disabled") && !isHidden(el)
  )
  const positive = stops
    .filter((el) => el.tabIndex > 0)
    .sort((a, b) => a.tabIndex - b.tabIndex)
  return [...positive, ...stops.filter((el) => el.tabIndex === 0)]
}

function moveTab(doc: Document, backward: boolean, scope?: Element) {
  const stops = tabOrder(doc)
  const active = doc.activeElement as HTMLElement | null
  // With focus outside `scope`, like on a page's own button, Tab goes into it.
  if (scope && !(active && scope.contains(active))) {
    const inside = stops.filter((el) => scope.contains(el))
    return (backward ? inside.at(-1) : inside[0])?.focus()
  }
  const index = active ? stops.indexOf(active) : -1
  const next = backward
    ? index < 0
      ? stops.at(-1)
      : stops[index - 1]
    : stops[index + 1]
  if (next) {
    next.focus()
  } else {
    active?.blur()
  }
}

// Enter and Space click a button as a browser does: a click with no pointer
// behind it, which the key that sent it explains.
const keyClick = (el: HTMLElement) =>
  el.dispatchEvent(
    markTrusted(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: 0,
      })
    )
  )

function keyEvent(type: string, init: ReturnType<typeof parseKey>) {
  return markTrusted(
    new KeyboardEvent(type, {
      ...init,
      code: codeOf(init.key),
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  )
}

// Writes one character where the caret is, as typing does: beforeinput, which
// can cancel it, then the value, then input.
function insert(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
  data: string
) {
  const before = markTrusted(
    new InputEvent("beforeinput", {
      data,
      inputType: "insertText",
      bubbles: true,
      cancelable: true,
    })
  )
  if (!el.dispatchEvent(before)) {
    return
  }
  if ("setRangeText" in el) {
    const start = el.selectionStart ?? el.value.length
    el.setRangeText(data, start, el.selectionEnd ?? start, "end")
  } else {
    el.textContent = (el.textContent ?? "") + data
  }
  el.dispatchEvent(
    markTrusted(
      new InputEvent("input", { data, inputType: "insertText", bubbles: true })
    )
  )
}

const activates = (el: Element | null, key: string) =>
  !!el &&
  (key === "Enter"
    ? el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement
    : key === " " &&
      (el instanceof HTMLButtonElement ||
        (el instanceof HTMLInputElement && /^(checkbox|radio)$/.test(el.type))))

const rendered = (el: Element) => {
  for (let at: Element | null = el; at; at = at.parentElement) {
    if (getComputedStyle(at).display === "none") {
      return false
    }
  }
  return getComputedStyle(el).visibility !== "hidden" && !isHidden(el)
}

function changed(el: HTMLInputElement) {
  el.dispatchEvent(
    markTrusted(new Event("input", { bubbles: true, composed: true }))
  )
  el.dispatchEvent(markTrusted(new Event("change", { bubbles: true })))
}

// What a browser does for a key on a native range input or radio, which an
// event sent from script never does.
function nativeKey(el: HTMLInputElement, key: string) {
  const inline = isRtl(el)
    ? ["ArrowLeft", "ArrowRight"]
    : ["ArrowRight", "ArrowLeft"]
  if (el.type === "radio" && el.name) {
    const by = [inline[0], "ArrowDown"].includes(key)
      ? 1
      : [inline[1], "ArrowUp"].includes(key)
        ? -1
        : 0
    const group = [
      ...(
        el.getRootNode() as Document | ShadowRoot
      ).querySelectorAll<HTMLInputElement>("input[type=radio]"),
    ].filter(
      (radio) =>
        radio === el ||
        (radio.name === el.name &&
          radio.form === el.form &&
          !radio.matches(":disabled") &&
          rendered(radio))
    )
    const next = group.at((group.indexOf(el) + by) % group.length)
    if (by && next && next !== el) {
      next.focus()
      keyClick(next)
    }
  } else if (el.type === "range") {
    const min = Number.parseFloat(el.min) || 0
    const max = el.max === "" ? 100 : Number.parseFloat(el.max)
    const any = el.step.toLowerCase() === "any"
    const step = any ? (max - min) / 100 : Number.parseFloat(el.step) || 1
    const value = Number.parseFloat(el.value)
    const page = Math.max(step, (max - min) / 10)
    const top = any ? max : min + Math.floor((max - min) / step) * step
    const next = [inline[0], "ArrowUp"].includes(key)
      ? value + step
      : [inline[1], "ArrowDown"].includes(key)
        ? value - step
        : (
            {
              PageUp: value + page,
              PageDown: value - page,
              Home: min,
              End: max,
            } as Record<string, number>
          )[key]
    if (next === undefined) {
      return
    }
    const snapped = any ? next : min + Math.round((next - min) / step) * step
    el.value = String(
      Number.parseFloat(Math.min(top, Math.max(min, snapped)).toPrecision(12))
    )
    if (Number.parseFloat(el.value) !== value) {
      changed(el)
    }
  }
}

/**
 * Presses keys one after another on the focused element, like `keys("Tab", "ArrowDown", "Enter")`.
 * Tab from outside `scope` goes into it.
 */
async function keys(doc: Document, names: string[], scope?: Element) {
  for (const name of names) {
    const init = parseKey(name)
    const target = (doc.activeElement as HTMLElement | null) ?? doc.body
    const proceeds = target.dispatchEvent(keyEvent("keydown", init))
    if (proceeds && init.key === "Tab") {
      moveTab(doc, init.shiftKey, scope)
    }
    const printable = init.key.length === 1 && !init.ctrlKey && !init.metaKey
    if (proceeds && printable && isEditable(target)) {
      insert(target, init.key)
    }
    if (proceeds && target instanceof HTMLInputElement) {
      nativeKey(target, init.key)
    }
    if (proceeds && init.key === "Enter" && activates(target, "Enter")) {
      keyClick(target)
    }
    const up = (doc.activeElement as HTMLElement | null) ?? doc.body
    up.dispatchEvent(keyEvent("keyup", init))
    if (proceeds && init.key === " " && activates(target, " ")) {
      keyClick(target)
    }
    await settle()
  }
}

/** Types text into the focused element, a key per character. */
const type = (doc: Document, text: string) =>
  keys(
    doc,
    [...text].map((char) => (char === " " ? "Space" : char))
  )

function center(el: Element) {
  const box = el.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

// A mouse's pointer event at a point. A real mouse has a size and pressure
// while pressed, which tells it from one a screen reader made up.
function pointer(type: string, at: { x: number; y: number }, pressed: boolean) {
  const init = {
    bubbles: !type.endsWith("enter") && !type.endsWith("leave"),
    cancelable: true,
    composed: true,
    clientX: at.x,
    clientY: at.y,
    button: type.endsWith("move") ? -1 : 0,
    buttons: pressed ? 1 : 0,
    detail: type === "click" ? 1 : 0,
  }
  if (!type.startsWith("pointer")) {
    return markTrusted(new MouseEvent(type, init))
  }
  return markTrusted(
    new PointerEvent(type, {
      ...init,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      width: 1,
      height: 1,
      pressure: pressed ? 0.5 : 0,
    })
  )
}

// The element focus goes to on a press: the nearest focusable one, else none.
function focusTarget(el: Element) {
  const target = el.closest<HTMLElement>(focusable)
  return target && !target.matches(":disabled") ? target : undefined
}

/**
 * Clicks an element with a mouse: down, focus, up, then click. A disabled form
 * control, by itself or a fieldset, gets the pointer events and nothing else, as in browsers.
 */
async function click(el: Element) {
  const at = center(el)
  const disabled = !!el
    .closest("button, input, select, textarea")
    ?.matches(":disabled")
  const down = el.dispatchEvent(pointer("pointerdown", at, true))
  if (!disabled && el.dispatchEvent(pointer("mousedown", at, true)) && down) {
    focusTarget(el)?.focus()
  }
  el.dispatchEvent(pointer("pointerup", at, false))
  if (!disabled) {
    el.dispatchEvent(pointer("mouseup", at, false))
    el.dispatchEvent(pointer("click", at, false))
  }
  await settle()
}

/** Moves a mouse onto an element, like resting on a trigger. */
async function hover(el: Element) {
  const at = center(el)
  for (const type of [
    "pointerover",
    "pointerenter",
    "mouseover",
    "mouseenter",
    "pointermove",
    "mousemove",
  ]) {
    el.dispatchEvent(pointer(type, at, false))
  }
  await settle()
}

/**
 * Drags an element with a mouse onto another, or by a distance: down, moves
 * past the drag threshold in steps, then up where it ends.
 */
async function drag(
  el: Element,
  target: { to: Element } | { by: { x: number; y: number } }
) {
  const from = center(el)
  const to =
    "to" in target
      ? center(target.to)
      : { x: from.x + target.by.x, y: from.y + target.by.y }
  el.dispatchEvent(pointer("pointerdown", from, true))
  el.dispatchEvent(pointer("mousedown", from, true))
  await settle()
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const steps = Math.max(2, Math.ceil(distance / dragThreshold))
  for (let step = 1; step <= steps; step++) {
    const at = {
      x: from.x + ((to.x - from.x) * step) / steps,
      y: from.y + ((to.y - from.y) * step) / steps,
    }
    el.dispatchEvent(pointer("pointermove", at, true))
    el.dispatchEvent(pointer("mousemove", at, true))
  }
  await settle()
  el.dispatchEvent(pointer("pointerup", to, false))
  el.dispatchEvent(pointer("mouseup", to, false))
  await settle()
}

export { click, drag, hover, keys, settle, type }
