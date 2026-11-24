import {
  anchorable,
  anchorStyles,
  fillsLayoutViewport,
  nameAnchor,
  unnameAnchor,
} from "./anchoring"
import { shadowRootsAround, watchMoves, watchShadowRoots } from "./moves"
import { opposite, physicalSide, type PhysicalSide, type Side } from "./sides"
import { ahead, registerUninherited } from "./style"

/**
 * How a popup lines up along the side it opens on.
 * @stable
 */
type Align = "start" | "center" | "end"

/**
 * Something to position against that isn't an element: a point, like the
 * pointer for a context menu, or anything with a bounding rectangle, like a
 * text selection's range. Read on every check, so it can move.
 * @stable
 */
type VirtualAnchor =
  | {
      getBoundingClientRect: () => {
        x: number
        y: number
        width: number
        height: number
      }
    }
  | { x: number; y: number }

/**
 * An element, a point or a rectangle a popup is positioned against.
 * @stable
 */
type Anchor = HTMLElement | VirtualAnchor

/**
 * Placement options every positioned popup takes. Components document their own defaults.
 * @stable
 */
type PositionProps = {
  /** Which side of the anchor the popup opens on. Flips to the other side when there isn't room. */
  side?: Side
  /** How the popup lines up with the anchor along that side. `start` and `end` follow the reading direction. */
  align?: Align
  /** Gap between the anchor and the popup, in pixels. */
  sideOffset?: number
  /** Shift along the anchor, in pixels. */
  alignOffset?: number
  /**
   * Space to keep from the viewport edges, in pixels.
   * @defaultValue 8
   */
  collisionPadding?: number
  /**
   * Space to keep between the arrow and the popup's corners, in pixels.
   * @defaultValue 6
   */
  arrowPadding?: number
  /**
   * Positions the popup against this instead of its trigger: an element, a CSS selector, a point
   * like `{ x, y }`, or anything with `getBoundingClientRect()`. It's read on every check, so it can
   * move. A controller's `open({ anchor })` wins for that open.
   */
  anchor?: Anchor | string | null
}

/**
 * Where a popup renders, for the cases the top layer doesn't cover.
 * @stable
 */
type PortalProps = {
  /**
   * Renders the popup into this element instead of in place, like a container
   * inside a shadow root or an iframe. On web components, a CSS selector.
   * Nested popups stay inside their parent.
   */
  container?: Element | DocumentFragment | null
}

// The box an element renders, or nothing when it renders none. One with
// `display: contents` has no box of its own, so it's the box around what it
// renders, text included.
function renderedRect(el: Element) {
  let rendered: Element | Range = el
  if (!el.getClientRects().length) {
    if (getComputedStyle(el).display !== "contents") {
      return undefined
    }
    rendered = el.ownerDocument.createRange()
    rendered.selectNodeContents(el)
    if (!rendered.getClientRects().length) {
      return undefined
    }
  }
  const { x, y, width, height } = rendered.getBoundingClientRect()
  return { x, y, width, height }
}

function anchorRect(anchor: Anchor | Rect) {
  const rect =
    "getBoundingClientRect" in anchor
      ? anchor.getBoundingClientRect()
      : { width: 0, height: 0, ...anchor }
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
  }
}

/**
 * How `position` places an element against its anchor.
 * @experimental
 */
type PositionOptions = {
  /** Which side of the anchor it opens on. @defaultValue "bottom" */
  side?: Side
  /** How it lines up with the anchor along that side. @defaultValue "start" */
  align?: Align
  /** Gap between the anchor and the element, in pixels. @defaultValue 4 */
  sideOffset?: number
  /** Shift along the anchor, in pixels. @defaultValue 0 */
  alignOffset?: number
  /** Space to keep from the viewport edges, in pixels. @defaultValue 8 */
  collisionPadding?: number
  /**
   * An element inside that points at the anchor, like an arrow, placed along
   * the edge facing it. A function is read on every check, so an arrow that
   * mounts later is still found.
   */
  arrow?: HTMLElement | null | (() => HTMLElement | null | undefined)
  /** Space to keep between the arrow and the corners, in pixels. @defaultValue 6 */
  arrowPadding?: number
}

type Placement = Required<
  Omit<PositionOptions, "arrow" | "arrowPadding" | "side">
> & { side: PhysicalSide }

type Rect = { x: number; y: number; width: number; height: number }

// The visible part of the page, which a pinch zoom shrinks and moves.
type Viewport = { x?: number; y?: number; width: number; height: number }

const isVertical = (side: Side) => side === "top" || side === "bottom"

function place(
  anchor: Rect,
  size: { width: number; height: number },
  side: PhysicalSide,
  align: Align,
  options: Placement
) {
  const { sideOffset, alignOffset } = options
  const vertical = side === "top" || side === "bottom"
  let x = 0
  let y = 0

  if (side === "bottom") {
    y = anchor.y + anchor.height + sideOffset
  }
  if (side === "top") {
    y = anchor.y - size.height - sideOffset
  }
  if (side === "right") {
    x = anchor.x + anchor.width + sideOffset
  }
  if (side === "left") {
    x = anchor.x - size.width - sideOffset
  }

  if (vertical) {
    if (align === "start") {
      x = anchor.x + alignOffset
    }
    if (align === "center") {
      x = anchor.x + anchor.width / 2 - size.width / 2 + alignOffset
    }
    if (align === "end") {
      x = anchor.x + anchor.width - size.width - alignOffset
    }
  } else {
    if (align === "start") {
      y = anchor.y + alignOffset
    }
    if (align === "center") {
      y = anchor.y + anchor.height / 2 - size.height / 2 + alignOffset
    }
    if (align === "end") {
      y = anchor.y + anchor.height - size.height - alignOffset
    }
  }
  return { x, y }
}

function overflow(
  side: PhysicalSide,
  point: { x: number; y: number },
  size: { width: number; height: number },
  viewport: Required<Viewport>,
  padding: number
) {
  if (side === "bottom") {
    return point.y + size.height - (viewport.y + viewport.height - padding)
  }
  if (side === "top") {
    return viewport.y + padding - point.y
  }
  if (side === "right") {
    return point.x + size.width - (viewport.x + viewport.width - padding)
  }
  return viewport.x + padding - point.x
}

function available(
  side: PhysicalSide,
  anchor: Rect,
  viewport: Required<Viewport>,
  options: Placement
) {
  const { sideOffset, collisionPadding: padding } = options
  const height =
    side === "bottom"
      ? viewport.y +
        viewport.height -
        padding -
        (anchor.y + anchor.height + sideOffset)
      : side === "top"
        ? anchor.y - sideOffset - padding - viewport.y
        : viewport.height - padding * 2
  const width =
    side === "right"
      ? viewport.x +
        viewport.width -
        padding -
        (anchor.x + anchor.width + sideOffset)
      : side === "left"
        ? anchor.x - sideOffset - padding - viewport.x
        : viewport.width - padding * 2
  return { width: Math.max(0, width), height: Math.max(0, height) }
}

// Start and end along the top or bottom follow the reading direction.
const physicalAlign = (side: PhysicalSide, align: Align, rtl = false) =>
  rtl && isVertical(side) && align !== "center"
    ? align === "start"
      ? "end"
      : "start"
    : align

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

function computePlacement(
  anchor: Rect,
  size: { width: number; height: number },
  visible: Viewport,
  placement: Omit<Placement, "side"> & {
    side: Side
    rtl?: boolean
    inside?: boolean
  }
) {
  const viewport = { x: 0, y: 0, ...visible }
  const options = {
    ...placement,
    side: physicalSide(placement.side, placement.rtl),
  }
  const align = physicalAlign(options.side, options.align, options.rtl)

  let side = options.side
  let point = place(anchor, size, side, align, options)
  const over = overflow(side, point, size, viewport, options.collisionPadding)
  if (over > 0) {
    const other = opposite[side]
    const otherPoint = place(anchor, size, other, align, options)
    if (
      overflow(other, otherPoint, size, viewport, options.collisionPadding) <
      over
    ) {
      side = other
      point = otherPoint
    }
  }

  const padding = options.collisionPadding
  const room = available(side, anchor, viewport, options)
  // Beside an anchor at least its size, like a context area opened from the
  // keyboard, with room on neither side, it goes on screen inside the anchor.
  // A popup not measured yet has no size to fit. `inside` keeps it there.
  let inside = false
  if (overflow(side, point, size, viewport, padding) > 0) {
    if (
      (side === "top" || side === "bottom") &&
      size.height &&
      (anchor.height >= size.height || options.inside)
    ) {
      inside = true
      point.y = clamp(
        clamp(
          point.y,
          viewport.y + padding,
          viewport.y + viewport.height - size.height - padding
        ),
        anchor.y,
        anchor.y + anchor.height - size.height
      )
      room.height = Math.max(0, viewport.height - padding * 2)
    } else if (
      (side === "left" || side === "right") &&
      size.width &&
      (anchor.width >= size.width || options.inside)
    ) {
      inside = true
      point.x = clamp(
        clamp(
          point.x,
          viewport.x + padding,
          viewport.x + viewport.width - size.width - padding
        ),
        anchor.x,
        anchor.x + anchor.width - size.width
      )
      room.width = Math.max(0, viewport.width - padding * 2)
    }
  }

  // Shifts along the anchor to stay on screen, but never past the anchor's
  // far edge, so a popup whose anchor scrolls away leaves with it. An
  // `alignOffset` that alone takes it past the anchor is kept.
  if (side === "top" || side === "bottom") {
    const x = clamp(
      point.x,
      viewport.x + padding,
      viewport.x + viewport.width - size.width - padding
    )
    point.x =
      x === point.x
        ? x
        : clamp(x, anchor.x - size.width, anchor.x + anchor.width)
  } else {
    const y = clamp(
      point.y,
      viewport.y + padding,
      viewport.y + viewport.height - size.height - padding
    )
    point.y =
      y === point.y
        ? y
        : clamp(y, anchor.y - size.height, anchor.y + anchor.height)
  }

  return {
    ...point,
    side,
    align: options.align,
    available: room,
    inside,
  }
}

const stillFrames = 3

const slowCheck = 500

// The room a popup has changes on every frame the page scrolls under it, so
// these variables don't inherit: only the popup restyles, not every element
// inside it. A child that needs the room copies it on the popup, like
// `[--list-height:var(--available-height)]`.
const roomVariables = ["--available-height", "--available-width"]

let roomRegistered = false

// Registering restyles the whole page, so it's done ahead of the first open.
// `position` still registers them if a popup opens first.
function preparePosition() {
  if (roomRegistered) {
    return
  }
  roomRegistered = true
  ahead(() => registerUninherited(roomVariables))
}

function createWriter(el: HTMLElement) {
  const written = new Map<string, string | null>()
  const changed = (name: string, value: string | null) => {
    if (written.get(name) === value) {
      return false
    }
    written.set(name, value)
    return true
  }
  return {
    style(name: string, value: string) {
      if (changed(`style:${name}`, value)) {
        el.style.setProperty(name, value)
      }
    },
    attribute(name: string, value: string | null) {
      if (!changed(name, value)) {
        return
      }
      if (value === null) {
        el.removeAttribute(name)
      } else {
        el.setAttribute(name, value)
      }
    },
    reset: () => written.clear(),
  }
}

function visibleViewport() {
  const visual = window.visualViewport
  return {
    x: visual?.offsetLeft ?? 0,
    y: visual?.offsetTop ?? 0,
    width: visual?.width ?? document.documentElement.clientWidth,
    height: visual?.height ?? document.documentElement.clientHeight,
  }
}

/**
 * Places a popup beside its anchor and keeps it there while anything moves,
 * flipping to the other side when there isn't room. The anchor can be an
 * element, a point like `{ x, y }` for a context menu at the pointer, or
 * anything with `getBoundingClientRect`, like a text selection's range. Sets
 * `data-side`, `data-align`, `--available-width`, `--available-height` and
 * `--transform-origin`. Works in the top layer and inside transformed
 * containers. Options can be a function, read on every check, so a popup
 * follows changes like a new side while it's open. Returns the cleanup.
 *
 * ```ts
 * const stop = position({ x: event.clientX, y: event.clientY }, menu, { side: "bottom", align: "start", sideOffset: 2 })
 * ```
 * @experimental
 */
function position(
  anchorOrGetter: Anchor | (() => Anchor | null | undefined),
  el: HTMLElement,
  optionsOrGetter: PositionOptions | (() => PositionOptions) = {}
) {
  const read = () =>
    typeof optionsOrGetter === "function" ? optionsOrGetter() : optionsOrGetter
  const anchorOf = () =>
    typeof anchorOrGetter === "function" ? anchorOrGetter() : anchorOrGetter
  const resolve = (options: PositionOptions) => ({
    side: options.side ?? ("bottom" as Side),
    align: options.align ?? "start",
    sideOffset: Number(options.sideOffset ?? 4),
    alignOffset: Number(options.alignOffset ?? 0),
    collisionPadding: Number(options.collisionPadding ?? 8),
  })
  registerUninherited(roomVariables)
  Object.assign(el.style, {
    position: "fixed",
    inset: "auto",
    margin: "0",
    left: "0",
    top: "0",
  })
  const popup = createWriter(el)
  const style = getComputedStyle(el)
  let arrowWriter:
    { el: HTMLElement; write: ReturnType<typeof createWriter> } | undefined

  let last = ""
  let insideAt = ""
  let placed = false
  // Sizes are left to `platform/moves.ts` and the slow check, not a
  // `ResizeObserver`: components whose own observers resize a popup, like a
  // navigation menu's viewport, would make the browser report "ResizeObserver
  // loop completed with undelivered notifications" for every such change.

  let unwatched = false
  let stopped = false
  let watchedRoots: Node[] = []
  let unwatchRoots = () => {}
  // Decided on the first placement. JS takes over for good once the browser can't follow.
  let decided = false
  let anchoring: { anchor: HTMLElement; name: string } | undefined
  let anchoredAt = { left: "0", top: "0" }
  let lastAnchorBox: Rect | undefined
  const anchoredStyles = new Set<string>()

  function unanchor(at = { left: "0", top: "0" }) {
    if (anchoring) {
      unnameAnchor(anchoring.anchor)
    }
    anchoring = undefined
    for (const name of anchoredStyles) {
      popup.style(name, "")
    }
    anchoredStyles.clear()
    last = ""
    popup.style("inset", "auto")
    popup.style("margin", "0")
    popup.style("left", at.left)
    popup.style("top", at.top)
  }

  function update() {
    if (stopped) {
      return false
    }
    const options = read()
    const resolved = resolve(options)
    const arrowPadding = Number(options.arrowPadding ?? 6)
    const anchor = anchorOf()
    if (!anchor) {
      return false
    }
    const node = "nodeType" in anchor ? (anchor as HTMLElement) : undefined
    const shown = node && renderedRect(node)
    // An anchor that left the page or stopped rendering has no place to
    // follow, so a placed popup stays where it was rather than jumping to a corner.
    if (node && placed && (!node.isConnected || !shown)) {
      if (anchoring) {
        unanchor(anchoredAt)
      }
      return false
    }
    // Read each time, since the same anchor can move to another shadow root.
    const around = node ? shadowRootsAround(node) : []
    if (
      around.length !== watchedRoots.length ||
      around.some((root, index) => root !== watchedRoots[index])
    ) {
      unwatchRoots()
      watchedRoots = around
      unwatchRoots = watchShadowRoots(around)
    }
    unwatched = !node && "getBoundingClientRect" in anchor
    const viewport = visibleViewport()
    if (
      anchoring &&
      (node !== anchoring.anchor || !fillsLayoutViewport(viewport))
    ) {
      unanchor()
    }
    if (!decided) {
      decided = true
      if (node && shown && anchorable(node, shown, el, style, viewport)) {
        anchoring = { anchor: node, name: nameAnchor(node) }
      } else {
        // A popup the browser placed last time keeps its anchor once closed.
        for (const name of leftoverStyles) {
          if (el.style.getPropertyValue(name)) {
            el.style.removeProperty(name)
          }
        }
      }
    } else if (anchoring) {
      nameAnchor(anchoring.anchor)
    }
    // The first placement never animates: a popup coming into view has no
    // place to move from, and a `left` or `top` transition would fly it in
    // from the corner. Later moves, between anchors, animate.
    const first = !placed
    const transition = el.style.transition
    if (first) {
      el.style.transition = "none"
    }
    const a = anchorRect(shown ?? anchor)
    const offsets = { width: el.offsetWidth, height: el.offsetHeight }
    const arrow = arrowOf(options)
    const arrowSize = arrow
      ? { width: arrow.offsetWidth, height: arrow.offsetHeight }
      : undefined
    const key = [
      a.x,
      a.y,
      a.width,
      a.height,
      offsets.width,
      offsets.height,
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
      arrowSize?.width,
      arrowSize?.height,
      ...Object.values(resolved),
      arrowPadding,
    ].join()
    // A new arrow element, even one the same size, has no placement of its own yet.
    if (key === last && (!arrow || arrow === arrowWriter?.el)) {
      return false
    }
    last = key
    // The padding box, which arrows are placed in. Read only when something
    // moved, and before any write, so it never forces a second layout.
    const inner = {
      left: el.clientLeft,
      top: el.clientTop,
      width: el.clientWidth,
      height: el.clientHeight,
    }

    const rtl = style.direction === "rtl"
    const exact = exactSize(style, offsets)
    if (anchoring) {
      const side = physicalSide(resolved.side, rtl)
      const styles = anchorStyles(
        anchoring.name,
        side,
        physicalAlign(side, resolved.align, rtl),
        resolved,
        exact
      )
      for (const [name, value] of Object.entries(styles)) {
        anchoredStyles.add(name)
        popup.style(name, value)
      }
    }
    const box = untransformed(el.getBoundingClientRect(), exact, style)
    // Placement works in screen pixels, and the popup's own styles in its
    // CSS pixels, which `zoom` or a scaled containing block make differ.
    const { scale } = box
    const size = {
      width: exact.width * scale.x,
      height: exact.height * scale.y,
    }
    // Once inside the anchor, it stays while nothing but its own size changes: a
    // popup that shrinks to fit is wider inside than beside, and would swap every frame.
    const surroundings = [
      a.x,
      a.y,
      a.width,
      a.height,
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
      ...Object.values(resolved),
    ].join()
    const placement = {
      ...resolved,
      inside: insideAt === surroundings,
      sideOffset:
        resolved.sideOffset * (isVertical(resolved.side) ? scale.y : scale.x),
      alignOffset:
        resolved.alignOffset * (isVertical(resolved.side) ? scale.x : scale.y),
      rtl,
    }
    const anchorBox = { x: a.x, y: a.y, width: a.width, height: a.height }
    const result = computePlacement(anchorBox, size, viewport, placement)
    insideAt = result.inside ? surroundings : ""
    const previous = lastAnchorBox
    lastAnchorBox = anchorBox
    const near = (point: { x: number; y: number }) =>
      Math.abs(box.x - point.x) <= 1 && Math.abs(box.y - point.y) <= 1
    if (anchoring) {
      // Anything the browser places differently is left to JS, like a
      // containing block the anchor isn't in, or a shift onto the screen,
      // which Chromium and Firefox work out once and then leave as it scrolls.
      const caughtUp = near(result)
      // While a page scrolls, they report the popup a frame late.
      const behind =
        !caughtUp &&
        !!previous &&
        near(computePlacement(previous, size, viewport, placement))
      if (!caughtUp && !behind) {
        unanchor()
        el.style.transition = transition
        return update()
      }
      if (behind) {
        last = ""
      }
      anchoredAt = {
        left: `${parseFloat(style.left) + parseFloat(style.marginLeft)}px`,
        top: `${parseFloat(style.top) + parseFloat(style.marginTop)}px`,
      }
    } else {
      // A transformed ancestor becomes the containing block for fixed elements:
      // where the popup is, less its computed offsets (mid-transition too),
      // finds that block's origin, so portaled popups land right.
      const origin = {
        x: box.x - (parseFloat(style.left) || 0) * scale.x,
        y: box.y - (parseFloat(style.top) || 0) * scale.y,
      }
      // On the device's pixel grid, so text inside renders the same each time.
      const ratio = el.ownerDocument.defaultView?.devicePixelRatio || 1
      const snap = (value: number) => Math.round(value * ratio) / ratio
      popup.style("left", `${snap((result.x - origin.x) / scale.x)}px`)
      popup.style("top", `${snap((result.y - origin.y) / scale.y)}px`)
    }
    const across = isVertical(result.side) ? scale.x : scale.y
    if (first) {
      placed = true
      // Reading a style applies the placement before transitions come back.
      void style.left
      el.style.transition = transition
    }

    popup.attribute("data-side", result.side)
    popup.attribute("data-align", result.align)
    popup.style("--available-height", `${result.available.height / scale.y}px`)
    popup.style("--available-width", `${result.available.width / scale.x}px`)
    popup.style("--anchor-width", `${a.width / scale.x}px`)
    popup.style("--anchor-height", `${a.height / scale.y}px`)
    const [originX, originY] = transformOrigin(
      result.side,
      result.align,
      rtl,
      a,
      size,
      result
    )
    popup.style(
      "--transform-origin",
      `${Math.round(originX / scale.x)}px ${Math.round(originY / scale.y)}px`
    )
    const paddingBox = {
      x: result.x + inner.left * scale.x,
      y: result.y + inner.top * scale.y,
      width: inner.width * scale.x,
      height: inner.height * scale.y,
    }
    // Where the anchor's center falls along the edge facing it, so a ::before
    // can be the arrow without an Arrow part.
    const edge = arrowOffset(a, paddingBox, result.side, arrowPadding * across)
    popup.style("--arrow-offset", `${Math.round(edge / across)}px`)

    if (arrow && arrowSize) {
      const box = { ...paddingBox, ...size }
      const length = {
        width: arrowSize.width * scale.x,
        height: arrowSize.height * scale.y,
      }
      const placed = computeArrow(
        a,
        box,
        length,
        result.side,
        arrowPadding * across
      )
      const offset = Math.round(placed.offset / across)
      if (arrowWriter?.el !== arrow) {
        arrowWriter = { el: arrow, write: createWriter(arrow) }
      }
      const { write } = arrowWriter
      write.style("position", "absolute")
      write.style("left", isVertical(result.side) ? `${offset}px` : "")
      write.style("top", isVertical(result.side) ? "" : `${offset}px`)
      write.attribute("data-side", result.side)
      write.attribute("data-align", result.align)
      write.attribute("data-arrow-clamped", placed.clamped ? "" : null)
    }
    return true
  }

  let frame = 0
  let still = 0
  function loop() {
    frame = 0
    still = update() ? 0 : still + 1
    if (still < stillFrames || unwatched) {
      frame = requestAnimationFrame(loop)
    }
  }
  function wake() {
    still = 0
    frame ||= requestAnimationFrame(loop)
  }
  const unwatch = watchMoves(wake, el)
  // While asleep, a slow check catches what no event reports, like an anchor
  // moved by a Web Animations API animation or a style sheet edited from
  // code. A move it finds wakes the loop, which then follows every frame.
  const slow = setInterval(() => frame || (update() && wake()), slowCheck)
  update()
  wake()
  const stop = () => {
    cancelAnimationFrame(frame)
    clearInterval(slow)
    unwatch()
    unwatchRoots()
    watchedRoots = []
    stopped = true
  }
  // Asks for a check when the options changed, like a new side rendered while
  // open or an arrow that bound late, without reading layout when they didn't.
  const initial = read()
  let asked = optionsKey(initial)
  let askedArrow = arrowOf(initial)
  function follow() {
    const options = read()
    const next = optionsKey(options)
    const arrow = arrowOf(options)
    if (next === asked && arrow === askedArrow) {
      return
    }
    asked = next
    askedArrow = arrow
    wake()
  }
  // Places the popup again now, as its first placement, without animating:
  // for a popup whose size only just became known, like a navigation menu's
  // viewport once its content renders.
  return Object.assign(stop, {
    follow,
    place() {
      placed = false
      last = ""
      popup.reset()
      arrowWriter?.write.reset()
      update()
    },
  })
}

const leftoverStyles = [
  "position-anchor",
  "position-try-fallbacks",
  "position-visibility",
]

const arrowOf = (options: PositionOptions) =>
  typeof options.arrow === "function" ? options.arrow() : options.arrow

const optionsKey = (options: PositionOptions) =>
  [
    options.side,
    options.align,
    options.sideOffset,
    options.alignOffset,
    options.collisionPadding,
    options.arrowPadding,
  ].join()

// The popup's border box before offsets round it to whole pixels, so a
// scale read from it is exact. The offsets when styles don't give it, like a
// `width` that doesn't match them.
function exactSize(
  style: Pick<
    CSSStyleDeclaration,
    "boxSizing" | "width" | "height" | "getPropertyValue"
  >,
  offsets: { width: number; height: number }
) {
  const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0
  const edges = (start: string, end: string) =>
    style.boxSizing === "border-box"
      ? 0
      : px(`padding-${start}`) +
        px(`padding-${end}`) +
        px(`border-${start}-width`) +
        px(`border-${end}-width`)
  const width = parseFloat(style.width) + edges("left", "right")
  const height = parseFloat(style.height) + edges("top", "bottom")
  const exact = {
    width: Math.abs(width - offsets.width) < 1,
    height: Math.abs(height - offsets.height) < 1,
  }
  return {
    width: exact.width ? width : offsets.width,
    height: exact.height ? height : offsets.height,
    exact,
  }
}

const angle = (value: string) => {
  const number = parseFloat(value) || 0
  if (value.endsWith("turn")) {
    return number * 2 * Math.PI
  }
  if (value.endsWith("grad")) {
    return (number * Math.PI) / 200
  }
  if (value.endsWith("rad")) {
    return number
  }
  return (number * Math.PI) / 180
}

// Where a popup's box would be on screen without its own transforms, like an
// entrance animation's: each corner goes through them around the transform
// origin. The scale left over is an ancestor's `zoom` or a scaled containing block.
function untransformed(
  rect: { x: number; y: number; width: number; height: number },
  size: {
    width: number
    height: number
    exact?: { width: boolean; height: boolean }
  },
  style: {
    transformOrigin: string
    translate: string
    rotate?: string
    scale?: string
    transform?: string
  }
) {
  const [originX = 0, originY = 0] = style.transformOrigin
    .split(" ")
    .map((part) => parseFloat(part) || 0)
  // A computed translate keeps percentages, of the element's own size.
  const length = (part: string | undefined, whole: number) =>
    !part
      ? 0
      : part.endsWith("%")
        ? (parseFloat(part) / 100) * whole
        : parseFloat(part) || 0
  const moves =
    style.translate && style.translate !== "none"
      ? style.translate.split(" ")
      : []
  const moveX = length(moves[0], size.width)
  const moveY = length(moves[1], size.height)
  // A turn around any axis shows on screen as its rotation matrix's top left
  // corner: a tilt around x or y squashes the box rather than turning it.
  const turn =
    style.rotate && style.rotate !== "none" ? style.rotate.split(" ") : []
  const named = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[turn[0]]
  const [kx, ky, kz] =
    named ?? (turn.length === 4 ? turn.slice(0, 3).map(parseFloat) : [0, 0, 1])
  const axis = Math.hypot(kx, ky, kz) || 1
  const [ux, uy, uz] = [kx / axis, ky / axis, kz / axis]
  const radians = turn.length ? angle(turn[turn.length - 1]) : 0
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)]
  const r = [
    cos + (1 - cos) * ux * ux,
    (1 - cos) * ux * uy - sin * uz,
    (1 - cos) * ux * uy + sin * uz,
    cos + (1 - cos) * uy * uy,
  ]
  const [scaleX = 1, scaleY = scaleX] =
    style.scale && style.scale !== "none"
      ? style.scale.split(" ").map(parseFloat)
      : []
  const matrix = /^matrix(3d)?\((.*)\)$/.exec(style.transform ?? "")
  const m = matrix?.[2].split(",").map(parseFloat) ?? []
  // A `perspective()` puts depth in the last row, which divides each corner.
  const [a, b, c, d, e, f, p, q, w] = !matrix
    ? [1, 0, 0, 1, 0, 0, 0, 0, 1]
    : matrix[1]
      ? [m[0], m[1], m[4], m[5], m[12], m[13], m[3], m[7], m[15]]
      : [...m, 0, 0, 1]
  const corner = (x: number, y: number) => {
    const [dx, dy] = [x - originX, y - originY]
    const depth = p * dx + q * dy + w || 1
    const tx = (scaleX * (a * dx + c * dy + e)) / depth
    const ty = (scaleY * (b * dx + d * dy + f)) / depth
    return [
      originX + moveX + r[0] * tx + r[1] * ty,
      originY + moveY + r[2] * tx + r[3] * ty,
    ]
  }
  const corners = [
    corner(0, 0),
    corner(size.width, 0),
    corner(0, size.height),
    corner(size.width, size.height),
  ]
  const xs = corners.map(([x]) => x)
  const ys = corners.map(([, y]) => y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  // Offsets round, so a box under a pixel off may be the size they gave.
  // Sizes from styles are exact, so any visible difference is a scale.
  const rest = (shown: number, whole: number, exact = false) =>
    whole > 0.01 && Math.abs(shown - whole) >= (exact ? 0.05 : 1)
      ? shown / whole
      : 1
  const scale = {
    x: rest(rect.width, Math.max(...xs) - left, size.exact?.width),
    y: rest(rect.height, Math.max(...ys) - top, size.exact?.height),
  }
  return { x: rect.x - scale.x * left, y: rect.y - scale.y * top, scale }
}

// Where an arrow sits along the popup's edge so it points at the anchor's
// center, kept clear of the corners. Clamped when the anchor's center is past
// a corner and the arrow had to stop short.
function computeArrow(
  anchor: Rect,
  popup: Rect,
  arrow: { width: number; height: number },
  side: PhysicalSide,
  padding: number
) {
  const vertical = side === "top" || side === "bottom"
  const length = vertical ? arrow.width : arrow.height
  const center = vertical
    ? anchor.x + anchor.width / 2 - popup.x
    : anchor.y + anchor.height / 2 - popup.y
  const ideal = center - length / 2
  const max = (vertical ? popup.width : popup.height) - length - padding
  const offset = Math.max(padding, Math.min(ideal, max))
  return { offset: Math.round(offset), clamped: Math.abs(offset - ideal) > 0.5 }
}

// How far along the popup's edge facing the anchor its center falls, from the
// start of the popup's padding box, kept `padding` away from both corners.
function arrowOffset(
  anchor: Rect,
  box: Rect,
  side: PhysicalSide,
  padding: number
) {
  const vertical = side === "top" || side === "bottom"
  const center = vertical
    ? anchor.x + anchor.width / 2 - box.x
    : anchor.y + anchor.height / 2 - box.y
  const length = vertical ? box.width : box.height
  return Math.round(
    Math.min(Math.max(center, padding), Math.max(padding, length - padding))
  )
}

function transformOrigin(
  side: PhysicalSide,
  align: Align,
  rtl: boolean,
  a: ReturnType<typeof anchorRect>,
  size: { width: number; height: number },
  point: { x: number; y: number }
) {
  if (side === "top" || side === "bottom") {
    const start = rtl ? a.right - point.x : a.left - point.x
    const end = rtl ? a.left - point.x : a.right - point.x
    const x =
      align === "center"
        ? a.left + a.width / 2 - point.x
        : align === "start"
          ? start
          : end
    return [x, side === "bottom" ? 0 : size.height]
  }
  const y =
    align === "center"
      ? a.top + a.height / 2 - point.y
      : align === "start"
        ? a.top - point.y
        : a.bottom - point.y
  return [side === "right" ? 0 : size.width, y]
}

export {
  type Align,
  type Anchor,
  anchorRect,
  arrowOffset,
  computeArrow,
  computePlacement,
  exactSize,
  type PortalProps,
  position,
  type PositionOptions,
  preparePosition,
  type PositionProps,
  untransformed,
  type VirtualAnchor,
}
