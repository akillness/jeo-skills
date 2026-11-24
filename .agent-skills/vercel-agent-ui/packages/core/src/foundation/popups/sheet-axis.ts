// A sheet moves along one axis, toward or away from the edge it's attached
// to. The machine only knows extents and a finger position that grows toward
// that edge; these helpers translate between it and the page for each side.
import { isRTL } from "../platform/env"
import { physicalSide, type PhysicalSide, type Side } from "../platform/sides"

/**
 * The edge a sheet comes from. `start` and `end` follow the writing direction, like a popup's `side`.
 * @stable
 */
type SheetSide = Side

function resolveSide(side: SheetSide, el: Element) {
  return physicalSide(
    side,
    side === "start" || side === "end" ? isRTL(el) : false
  )
}

const isVertical = (side: PhysicalSide) => side === "bottom" || side === "top"

const towardEdge = (side: PhysicalSide) =>
  side === "bottom" || side === "right" ? 1 : -1

/** A pointer position as the machine reads it: `y` along the axis, growing toward the edge, and `x` across it. */
function axisPoint(
  side: PhysicalSide,
  clientX: number,
  clientY: number,
  into: { x: number; y: number }
) {
  const vertical = isVertical(side)
  into.y = (vertical ? clientY : clientX) * towardEdge(side)
  into.x = vertical ? clientX : clientY
  return into
}

/** The `translate` that moves a sheet `offset` px toward its edge from where it's laid out. */
function translateValue(side: PhysicalSide, offset: number) {
  const value = `${Math.round(offset * towardEdge(side) * 100) / 100}px`
  return isVertical(side) ? `0 ${value}` : `${value} 0`
}

/** The sheet's own size along its axis, ignoring transforms. */
function sizeAlong(el: HTMLElement, side: PhysicalSide) {
  return isVertical(side) ? el.offsetHeight : el.offsetWidth
}

/**
 * What a scroll area under the finger can do, in the machine's terms: `atStart`
 * means it can't scroll further the way a finger moving toward the edge
 * scrolls it, and `atEnd` the other way. Null when no scroll area inside the
 * sheet scrolls along the axis.
 */
function scrollContext(
  target: EventTarget | null,
  sheet: HTMLElement,
  side: PhysicalSide
) {
  const area = scrollAreaAt(target, sheet, side)
  if (!area) {
    return null
  }
  const { start, end } = scrollEdges(area, side)
  return { atStart: start, atEnd: end, area }
}

// The nearest element between the target and the sheet that scrolls along the axis.
function scrollAreaAt(
  target: EventTarget | null,
  sheet: HTMLElement,
  side: PhysicalSide
) {
  const view = sheet.ownerDocument.defaultView
  if (!view || !(target instanceof Element) || !sheet.contains(target)) {
    return null
  }
  const vertical = isVertical(side)
  for (
    let node: Element | null = target;
    node && node !== sheet.parentElement;
    node = node.parentElement
  ) {
    const scrollable = vertical
      ? node.scrollHeight > node.clientHeight + 1
      : node.scrollWidth > node.clientWidth + 1
    if (!scrollable || !(node instanceof HTMLElement)) {
      continue
    }
    const overflow = vertical
      ? view.getComputedStyle(node).overflowY
      : view.getComputedStyle(node).overflowX
    if (/auto|scroll/.test(overflow)) {
      return node
    }
  }
  return null
}

// How far the area is scrolled forward, away from the edge the sheet closes
// toward, and how far it can go. Right-to-left scrollLeft runs negative.
function forwardScroll(area: HTMLElement, side: PhysicalSide) {
  if (isVertical(side)) {
    const max = area.scrollHeight - area.clientHeight
    return {
      position: side === "bottom" ? area.scrollTop : max - area.scrollTop,
      max,
    }
  }
  const max = area.scrollWidth - area.clientWidth
  const left = Math.abs(area.scrollLeft)
  const fromLeft = isRTL(area) ? max - left : left
  return { position: side === "right" ? fromLeft : max - fromLeft, max }
}

function scrollEdges(area: HTMLElement, side: PhysicalSide) {
  const { position, max } = forwardScroll(area, side)
  return { start: position <= 0.5, end: position >= max - 1 }
}

/** Scrolls the area forward, away from the sheet's edge, by `delta` px, or back when negative. */
function scrollForward(area: HTMLElement, side: PhysicalSide, delta: number) {
  if (isVertical(side)) {
    area.scrollTop += side === "bottom" ? delta : -delta
  } else {
    const physical = side === "right" ? delta : -delta
    area.scrollLeft += isRTL(area) ? -physical : physical
  }
}

export {
  axisPoint,
  isVertical,
  resolveSide,
  scrollAreaAt,
  scrollContext,
  scrollForward,
  type SheetSide,
  sizeAlong,
  translateValue,
}
