// Where presses and hovers find resize handles. One listener per document
// serves every group, so a handle's hit area can be larger than the handle,
// and handles of nested groups that meet drag together, one along each axis.
import { swallowNextClick } from "../../foundation/drag-and-drop/pointer"
import { pressedScrollbar } from "../../foundation/platform/scrollbar"
import { writeStyle } from "../../foundation/platform/style"

/** A handle as the page sees it. */
type HandleTarget = {
  el: HTMLElement
  // The group's element. A press only counts when what it landed on is in
  // there, so a dialog or a popover above a handle keeps its presses.
  root: () => HTMLElement | undefined
  // The axis it moves along, or null while it can't move.
  axis: () => "x" | "y" | null
  // Its cursor now, which points the only way it can go at a limit.
  cursor: () => string
  start: (event: PointerEvent) => void
  hover: (hovered: boolean) => void
}

// How wide a hit area is at least, in CSS pixels, centered on the handle. A
// thin visual line stays easy to grab. Touch gets the WCAG minimum target size.
const hitSize = { fine: 10, coarse: 24 }

const targets = new Set<HandleTarget>()
const listening = new WeakSet<Document>()
let hovered: HandleTarget[] = []
let active: HandleTarget[] = []
let activeTouch = false
let releaseTouch = () => {}

/** Makes a handle findable by presses and hovers near it. Returns the cleanup. */
function registerHandle(target: HandleTarget) {
  targets.add(target)
  listen(target.el.ownerDocument)
  return () => {
    targets.delete(target)
    if (hovered.includes(target)) {
      setHovered(hovered.filter((other) => other !== target))
    }
    releaseHandle(target)
  }
}

/** Ends a handle's drag in the page's eyes: its cursor and the drag styles go. */
function releaseHandle(target: HandleTarget) {
  active = active.filter((other) => other !== target)
  // A handle removed mid-drag never hears its touchend, so the drag's end,
  // not the finger's, lets the page pan again.
  if (!active.length) {
    releaseTouch()
  }
  updateCursor(target.el.ownerDocument)
}

/** The cursor may have changed, like at a limit. */
const refreshCursor = (doc: Document) => updateCursor(doc)

// What the press landed on must belong to one of these groups. Anything
// else above them, like a dialog or a popover, owns the press.
const owns = (target: HandleTarget, top: Element) =>
  target.el.contains(top) || target.root()?.contains(top)

// The handles at a point: the nearest, plus one of the other axis where two meet.
function hitTest(x: number, y: number, coarse: boolean, top: Element | null) {
  if (top && !someOwns(top)) {
    return []
  }
  const pad = coarse ? hitSize.coarse : hitSize.fine
  const hits: { target: HandleTarget; axis: "x" | "y"; distance: number }[] = []
  for (const target of targets) {
    const axis = target.axis()
    if (!axis || !target.el.isConnected) {
      continue
    }
    const rect = target.el.getBoundingClientRect()
    if (!rect.width && !rect.height) {
      continue
    }
    const thickness = axis === "x" ? rect.width : rect.height
    const reach = Math.max(0, (pad - thickness) / 2)
    const dx = Math.max(rect.left - x, 0, x - rect.right)
    const dy = Math.max(rect.top - y, 0, y - rect.bottom)
    if (dx <= reach && dy <= reach) {
      hits.push({ target, axis, distance: Math.hypot(dx, dy) })
    }
  }
  if (top && !hits.some(({ target }) => owns(target, top))) {
    return []
  }
  hits.sort((a, b) => a.distance - b.distance)
  const nearest = hits[0]
  if (!nearest) {
    return []
  }
  const crossing = hits.find((hit) => hit.axis !== nearest.axis)
  return crossing ? [nearest.target, crossing.target] : [nearest.target]
}

// Checked before measuring too, so a tap outside every group reads no layout.
function someOwns(top: Element) {
  for (const target of targets) {
    if (owns(target, top)) {
      return true
    }
  }
  return false
}

function listen(doc: Document) {
  if (listening.has(doc)) {
    return
  }
  listening.add(doc)
  const view = doc.defaultView ?? window
  let frame = 0
  let point: { x: number; y: number; coarse: boolean } | undefined

  // Bubbling, after the page's own handlers, so one that calls
  // preventDefault() keeps the press, like a button inside a panel.
  doc.addEventListener("pointerdown", (event) => {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      event.defaultPrevented ||
      !targets.size
    ) {
      return
    }
    const top = event.target as Element | null
    const mouse = event.pointerType === "mouse"
    const hits = hitTest(event.clientX, event.clientY, !mouse, top)
    if (
      !hits.length ||
      (top &&
        !hits.some((hit) => hit.el.contains(top)) &&
        pressedScrollbar(event, top))
    ) {
      return
    }
    // No text selection and no focus change: focus stays where the user was working.
    event.preventDefault()
    // A press beside a handle, over a panel's content, drags. Its release
    // would click whatever is under it, moved or not.
    if (top && !hits.some((hit) => hit.el.contains(top))) {
      swallowNextClick(doc, true)
    }
    active = hits
    activeTouch = event.pointerType === "touch"
    if (activeTouch) {
      holdTouch(doc)
    }
    for (const hit of hits) {
      hit.start(event)
    }
    updateCursor(doc)
  })

  // Hovers near a handle highlight it and show its cursor, once a frame.
  doc.addEventListener(
    "pointermove",
    (event) => {
      if (event.buttons || active.length || !targets.size) {
        return
      }
      point = {
        x: event.clientX,
        y: event.clientY,
        coarse: event.pointerType !== "mouse",
      }
      frame ||= view.requestAnimationFrame(() => {
        frame = 0
        if (!point || active.length) {
          return
        }
        setHovered(
          hitTest(
            point.x,
            point.y,
            point.coarse,
            doc.elementFromPoint(point.x, point.y)
          )
        )
        updateCursor(doc)
      })
    },
    { passive: true }
  )
  doc.documentElement.addEventListener("pointerleave", () => {
    point = undefined
    setHovered([])
    updateCursor(doc)
  })
}

// A press in the touch hit area but beside the handle lands where the page
// can pan, and the browser would cancel the drag to scroll.
function holdTouch(doc: Document) {
  releaseTouch()
  const hold = (event: TouchEvent) => event.preventDefault()
  const end = (event: TouchEvent) => {
    if (!event.touches.length) {
      releaseTouch()
    }
  }
  releaseTouch = () => {
    doc.removeEventListener("touchmove", hold, true)
    doc.removeEventListener("touchend", end, true)
    doc.removeEventListener("touchcancel", end, true)
    releaseTouch = () => {}
  }
  // Capturing, so a page handler that stops the event can't keep it held.
  doc.addEventListener("touchmove", hold, { capture: true, passive: false })
  doc.addEventListener("touchend", end, true)
  doc.addEventListener("touchcancel", end, true)
}

function setHovered(next: HandleTarget[]) {
  for (const target of hovered) {
    if (!next.includes(target)) {
      target.hover(false)
    }
  }
  for (const target of next) {
    if (!hovered.includes(target)) {
      target.hover(true)
    }
  }
  hovered = next
}

// The cursor shows everywhere while hovering or dragging, so it stays as the
// pointer passes over panel content. A drag also stops text selection and
// keeps iframes from swallowing the moves.
function updateCursor(doc: Document) {
  const shown = active.length ? active : hovered
  // Each write restyles the whole page. A touch drag skips it: it shows no
  // cursor, and its pointer is captured, so iframes can't take the moves.
  if (!shown.length || (active.length && activeTouch)) {
    return setPageStyle(doc, "")
  }
  const cursor = shown.length > 1 ? "move" : shown[0].cursor()
  const dragging = active.length
    ? "user-select:none!important;-webkit-user-select:none!important}iframe{pointer-events:none!important"
    : ""
  setPageStyle(
    doc,
    `*,*::before,*::after{cursor:${cursor}!important;${dragging}}`
  )
}

const sheets = new WeakMap<
  Document,
  { css: string; set: (css: string) => void }
>()

// One style sheet per document, adopted after the page's own, so its
// important rules win. Constructed sheets need no nonce under a strict
// Content Security Policy; the page's other ui-sdk styles are the fallback.
// Writing a sheet restyles the whole page, so the same text isn't written
// again.
function setPageStyle(doc: Document, css: string) {
  let sheet = sheets.get(doc)
  if (!sheet) {
    if (!css) {
      return
    }
    sheet = { css: "", set: pageSheet(doc) }
    sheets.set(doc, sheet)
  }
  if (sheet.css === css) {
    return
  }
  sheet.css = css
  sheet.set(css)
}

function pageSheet(doc: Document) {
  const View = doc.defaultView as
    (Window & { CSSStyleSheet: typeof CSSStyleSheet }) | null
  try {
    const sheet = new View!.CSSStyleSheet()
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet]
    return (css: string) => sheet.replaceSync(css)
  } catch {
    return (css: string) => writeStyle(doc, "ui-sdk-resizable", css)
  }
}

export { type HandleTarget, refreshCursor, registerHandle, releaseHandle }
