// The DOM side of a toast region: default styles, stacking variables, swipe
// directions, the text announced for a toast and where focus goes when a
// focused toast closes. Decisions are pure; the region calls them from `bind`.
import type { SwipeDirection } from "./swipe"
import { on } from "../../foundation/kernel/events"
import { writeStyle } from "../../foundation/platform/style"

// Defaults for the region and its list, in the lowest cascade layer with zero
// specificity, so any class replaces them. Enough for an unstyled
// `<OverlayHost />` to show toasts in the corner, above the on-screen keyboard
// and inside the safe area.
const defaults = `@layer ui-sdk {
:where([data-slot="toast-region"]) { position: fixed; z-index: 2147483000; display: flex; flex-direction: column; max-width: 100vw }
:where([data-slot="toast-region"][data-side="bottom"]) { bottom: calc(var(--keyboard-inset, 0px) + env(safe-area-inset-bottom, 0px)) }
:where([data-slot="toast-region"][data-side="top"]) { top: env(safe-area-inset-top, 0px) }
:where([data-slot="toast-region"][data-align="start"]) { inset-inline-start: env(safe-area-inset-left, 0px) }
:where([data-slot="toast-region"][data-align="end"]) { inset-inline-end: env(safe-area-inset-right, 0px) }
:where([data-slot="toast-region"][data-align="center"]) { left: 50%; translate: -50% 0 }
:where([data-slot="toast-list"]) { margin: 0; padding: 0; list-style: none }
}`

// Adds the defaults to a document once. They build on the popover reset, so
// the region writes it first, and these come after it.
function addToastStyles(doc: Document) {
  writeStyle(doc, "ui-sdk-toast-defaults", defaults)
}

/**
 * Where a toast can be swiped to dismiss it: toward the edge its region sits
 * on, and toward the side it's aligned to. `start` and `end` follow the
 * writing direction.
 */
function swipeDirections(
  side: "top" | "bottom",
  align: "start" | "center" | "end",
  rtl: boolean
) {
  const directions: SwipeDirection[] = [side === "top" ? "up" : "down"]
  if (align === "end") {
    directions.push(rtl ? "left" : "right")
  }
  if (align === "start") {
    directions.push(rtl ? "right" : "left")
  }
  return directions
}

/**
 * The stacking variables for each shown toast, newest first: its position
 * (`index`), and how far the toasts in front of it reach when the stack is
 * expanded (`offset`, the sum of their heights). Closing toasts keep the
 * place they had, so the rest close up around them.
 */
function stackLayout(
  toasts: readonly { id: string; index: number; leaving: boolean }[],
  heights: Map<string, number>
) {
  let offset = 0
  let total = 0
  const layout = new Map<string, { index: number; offset: number }>()
  for (const toast of toasts) {
    if (toast.leaving) {
      continue
    }
    layout.set(toast.id, { index: toast.index, offset })
    const height = heights.get(toast.id) ?? 0
    offset += height
    total += height
  }
  const front = toasts.find((toast) => !toast.leaving)
  return { layout, total, front: front ? heights.get(front.id) : 0 }
}

/**
 * A toast's border-box height with its content laid out freely, whatever
 * height the stack gives it, so the stack can animate between known heights.
 */
function naturalHeight(el: HTMLElement) {
  const { style } = el
  const value = style.getPropertyValue("height")
  const priority = style.getPropertyPriority("height")
  style.setProperty("height", "auto", "important")
  const css = getComputedStyle(el)
  let height = parseFloat(css.height)
  if (css.boxSizing !== "border-box") {
    for (const side of ["Top", "Bottom"] as const) {
      height +=
        parseFloat(css[`padding${side}`]) +
        parseFloat(css[`border${side}Width`])
    }
  }
  style.setProperty("height", value, priority)
  // Read again with its height back, so the next change transitions from it rather than from auto.
  getComputedStyle(el).height
  return height
}

/**
 * Writes a height as a pixel variable. A toast with no layout, like one under
 * a hidden ancestor, has no height to measure, so its variables stay unset and
 * the page's own styles apply until it's laid out.
 */
function writeHeight(el: HTMLElement, name: string, height: number) {
  if (Number.isNaN(height)) {
    el.style.removeProperty(name)
  } else {
    el.style.setProperty(name, `${height}px`)
  }
}

/**
 * Where focus goes when the focused toast closes: the next toast, else the
 * one before it, else back where it was before it entered the region. Never
 * the page's body.
 */
function focusAfterClose<T>(
  toasts: readonly T[],
  closing: T,
  fallback: T | undefined
) {
  const index = toasts.indexOf(closing)
  const rest = toasts.filter((toast) => toast !== closing)
  if (!rest.length) {
    return fallback
  }
  return rest[Math.min(Math.max(index, 0), rest.length - 1)]
}

/**
 * Whether a press landed on selectable text, rather than around it. A mouse
 * drag that starts there selects the text, so it doesn't swipe.
 */
function pressedText(event: PointerEvent) {
  const doc = (event.target as Node | null)?.ownerDocument
  if (!doc) {
    return false
  }
  const { clientX: x, clientY: y } = event
  const caret = doc.caretPositionFromPoint?.(x, y)
  const node = caret
    ? caret.offsetNode
    : doc.caretRangeFromPoint?.(x, y)?.startContainer
  if (node?.nodeType !== Node.TEXT_NODE) {
    return false
  }
  // `user-select: auto` takes its parent's, which Firefox doesn't compute.
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { userSelect, webkitUserSelect } = getComputedStyle(el)
    const value = userSelect || webkitUserSelect
    if (value === "none") {
      return false
    }
    if (value && value !== "auto") {
      break
    }
  }
  const range = doc.createRange()
  range.selectNodeContents(node)
  return Array.from(range.getClientRects()).some(
    (rect) =>
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  )
}

/**
 * Follows where the user's attention is for a region: the pointer over it
 * (touch doesn't hover), focus in it, and the window or page going away. A
 * window losing focus to an iframe on the page hasn't gone away. A page that's
 * hidden from the start reports it at once. Returns a cleanup.
 */
function watchAttention(
  el: HTMLElement,
  report: {
    hover: (hovered: boolean) => void
    // `from` is where focus came from, outside the region, when it entered.
    focus: (focused: boolean, from?: HTMLElement) => void
    away: (reason: "window-blur" | "page-hide", away: boolean) => void
  }
) {
  const doc = el.ownerDocument
  const view = doc.defaultView ?? window
  const onVisibility = () =>
    report.away("page-hide", doc.visibilityState === "hidden")
  const offs = [
    on(
      el,
      "pointerenter",
      (event) => event.pointerType !== "touch" && report.hover(true)
    ),
    on(
      el,
      "pointerleave",
      (event) => event.pointerType !== "touch" && report.hover(false)
    ),
    on(el, "focusin", (event) => {
      const from = event.relatedTarget as HTMLElement | null
      report.focus(true, from && !el.contains(from) ? from : undefined)
    }),
    on(el, "focusout", (event) => {
      const to = event.relatedTarget as Node | null
      if (to) {
        return void (!el.contains(to) && report.focus(false))
      }
      // Focus went nowhere, or a framework removed the focused element from
      // inside its own render: checked once that's done.
      queueMicrotask(
        () =>
          (!doc.hasFocus() || !el.contains(doc.activeElement)) &&
          report.focus(false)
      )
    }),
    on(view, "blur", () =>
      setTimeout(
        () =>
          doc.activeElement?.tagName !== "IFRAME" &&
          report.away("window-blur", true)
      )
    ),
    on(view, "focus", () => report.away("window-blur", false)),
  ]
  doc.addEventListener("visibilitychange", onVisibility)
  if (doc.visibilityState === "hidden") {
    report.away("page-hide", true)
  }
  return () => {
    offs.forEach((off) => off())
    doc.removeEventListener("visibilitychange", onVisibility)
  }
}

export {
  addToastStyles,
  focusAfterClose,
  naturalHeight,
  pressedText,
  stackLayout,
  swipeDirections,
  watchAttention,
  writeHeight,
}
