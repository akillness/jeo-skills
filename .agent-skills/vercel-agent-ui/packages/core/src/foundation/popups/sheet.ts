// The sheet presentation: makes a popup's content a sheet that rests on snap
// points, follows a finger, and moves the page's effects with it. Drawer
// uses it from its content's `bind`, next to `createPopupLayer`.
//
// It owns the geometry (snap points from the screen, the content and the
// keyboard), picks the driver, wires the effects, keeps a focused field in
// view above the keyboard, and stacks sheets opened from inside each other.
// The component keeps the state: it hears about snaps, rests and dismissals
// through callbacks and tells the sheet where to go.
import { contentScroll } from "../motion/content-scroll"
import type { SheetConfig, SheetSnapReason } from "../motion/machine"
import { sheetPhysics, type SheetPhysics } from "../motion/physics"
import {
  findSnapIndex,
  isAtOrBelow,
  resolveSnapPoints,
  type ResolvedSnapPoint,
  type SnapPoint,
} from "../motion/snap-points"
import { on } from "../kernel/events"
import type { Layer } from "../platform/layers"
import { trackKeyboard } from "../platform/keyboard"
import { isIOS } from "../platform/env"
import {
  isVertical,
  resolveSide,
  scrollAreaAt,
  sizeAlong,
  type SheetSide,
} from "./sheet-axis"
import type { PhysicalSide } from "../platform/sides"
import {
  closedExtentFor,
  setStyles,
  toolbarBleed,
  type SheetDriver,
  type SheetDriverName,
} from "./sheet-driver"
import {
  createSheetEffects,
  type SheetMotion,
  type SheetOutlet,
} from "./sheet-effects"
import { createPointerDriver } from "./sheet-pointer"
import { createScrollSnapDriver } from "./sheet-scroll-snap"
import { dimThemeColor } from "./theme-color"

/**
 * What a sheet reads from its component. Only `host` and `onDismiss` are
 * required; the rest default to a bottom sheet at its own size that can be
 * dismissed, so Menu, Select and Dialog can present as one with a few lines.
 * Getters are read when they matter, so option changes apply while it's open.
 */
type SheetOptions = {
  /** The full-screen element the sheet sits in. It goes into the top layer. */
  host: HTMLElement
  /** The edge it comes from. Defaults to `"bottom"`. */
  side?: () => SheetSide
  /** Where it can rest. Defaults to `["content"]`, its own size. */
  snapPoints?: () => readonly SnapPoint[]
  /** The snap point the sheet should rest on, from the component's state. Defaults to the first. */
  snapPoint?: () => SnapPoint | null
  /** Whether a swipe can dismiss it. Defaults to true. */
  dismissible?: () => boolean
  /** At or below this snap point the page stays usable and undimmed. */
  modalAbove?: () => SnapPoint | undefined
  /** Defaults to `"auto"`. */
  driver?: () => SheetDriverName
  /** Whether a drag on scrollable content grows the sheet first. Defaults to true. */
  expandOnScroll?: () => boolean
  physics?: () => Partial<SheetPhysics> | undefined
  backdrop?: () => HTMLElement | undefined
  /** Dims with the host's own `::backdrop` instead of a `backdrop` element, like a popup presented as a sheet. */
  hostBackdrop?: boolean
  outlets?: () => readonly SheetOutlet[]
  /** The sheet this one opened from, which it pushes back while open. */
  parent?: () => Sheet | undefined
  themeColor?: () => boolean
  preventEdgeSwipe?: () => boolean
  /** Whether a mouse press on `target` may drag the sheet. Defaults to empty space and text, never controls. */
  canMouseDrag?: (target: Element) => boolean
  /** A swipe dismissed it; it's already settling closed. Close the component here. */
  onDismiss: (event?: Event) => void
  /** The resting snap point changed, at release or when a programmatic move starts. */
  onSnap?: (point: SnapPoint, reason: SheetSnapReason, event?: Event) => void
  /** It came to rest, on a snap point or closed (null). */
  onRest?: (point: SnapPoint | null) => void
  /** A swipe tried to dismiss it while `dismissible` is false. */
  onDismissAttempt?: (event?: Event) => void
  onDragChange?: (dragging: boolean) => void
  /** The geometry changed: the resolved side and snap points. */
  onLayout?: (layout: {
    side: PhysicalSide
    snapPoints: readonly ResolvedSnapPoint[]
  }) => void
}

const controls =
  'a[href], button, label, summary, [role="button"], [role="link"], [role="slider"], [tabindex]:not([tabindex="-1"])'

/** Whether a mouse press on `target` may drag a sheet: empty space and text, not controls. */
const isDragSurface = (target: Element) => !target.closest(controls)

const none = () => {}

function withDefaults(options: SheetOptions) {
  return {
    side: () => "bottom" as SheetSide,
    // check-code: allow return-type the literal would widen to `string[]`.
    snapPoints: (): readonly SnapPoint[] => ["content"],
    snapPoint: () => null,
    dismissible: () => true,
    modalAbove: () => undefined,
    // check-code: allow return-type the literal would widen to string.
    driver: (): SheetDriverName => "auto",
    expandOnScroll: () => true,
    physics: () => undefined,
    backdrop: () => undefined,
    hostBackdrop: false,
    outlets: () => [],
    parent: () => undefined,
    themeColor: () => false,
    preventEdgeSwipe: () => false,
    canMouseDrag: isDragSurface,
    onSnap: none,
    onRest: none,
    onDismissAttempt: none,
    onDragChange: none,
    onLayout: none,
    ...withoutUndefined(options),
  }
}

function withoutUndefined<T extends object>(object: T) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  ) as T
}

/** A sheet attached to an element, for the component that owns it. */
type Sheet = {
  element: HTMLElement
  /** The sheet this one opened from. */
  parent: () => Sheet | undefined
  /** Shows the sheet at its snap point, rising from closed unless `animate` is false. */
  open: (animate: boolean) => void
  /** Settles closed. Presence waits for the animation. */
  close: () => void
  /** Moves to a snap point. `reason` comes back through `onSnap` if it's a change. */
  snapTo: (point: SnapPoint, reason: SheetSnapReason) => void
  /** A refused dismissal: a small push toward closing that springs back. */
  nudge: () => void
  /** The resolved snap points, ascending. */
  snapPoints: () => readonly ResolvedSnapPoint[]
  /** The snap point it rests on or is settling to. */
  target: () => SnapPoint | null
  /** Whether resting at `point` leaves the page usable, because it's at or below `modalAbove`. */
  isInteractiveAt: (point: SnapPoint | null) => boolean
  /** Measures again, like after an option that changes the geometry. */
  refresh: () => void
  destroy: () => void
}

const sheets = new WeakSet<Element>()

/** Open sheets by their popup layer, so a sheet opened from inside another stacks on it. */
const sheetLayers = new WeakMap<Layer, () => Sheet | undefined>()

/** The sheet of the nearest layer above `layer` that has one. */
function parentSheet(layer: Layer) {
  for (let up = layer.parent; up; up = up.parent) {
    const sheet = sheetLayers.get(up)
    if (sheet) {
      return sheet
    }
  }
}

function sheetAt(target: EventTarget | null) {
  for (let node = target instanceof Element ? target : null; node;) {
    if (sheets.has(node)) {
      return node
    }
    const root = node.getRootNode()
    node = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
  }
  return null
}

// Where the browser has a top layer, a popup opened from inside a sheet is
// rendered in it, and focus inside it is that popup's to show.
function inNestedLayer(field: Element, sheet: Element) {
  const layer = field.closest("[popover]")
  return !!layer && layer !== sheet && sheet.contains(layer)
}

// A press this close to the screen's left or right edge starts iOS Safari's
// back and forward swipe.
const edgeZone = 24

// `"auto"` picks scroll snap on touch screens: the browser moves the sheet
// with native scrolling, off the main thread and at the display's rate
// (Safari runs script-driven frames at 60Hz by default, even on 120Hz
// screens), and hands off to content scrolling natively, as the sheets that
// feel most native on the web do. Mouse and pen keep the pointer driver, as
// does a sheet the page stays usable beside, since WebKit can drop touches on
// a scroller that lets presses through (bug 183870), and one whose content
// scrolls before it grows, which only the pointer driver can hand off.
function usesScrollSnap(
  view: Window,
  options: ReturnType<typeof withDefaults>
) {
  const driver = options.driver()
  if (driver !== "auto") {
    return driver === "scroll-snap"
  }
  return (
    options.modalAbove() === undefined &&
    options.expandOnScroll() &&
    !!view.matchMedia?.("(hover: none) and (pointer: coarse)").matches
  )
}

// How the iOS keyboard slides: 250ms on UIKit's keyboard curve, as commonly
// measured. A sheet riding on it moves the same way.
const keyboardMotion = {
  duration: 250,
  easing: "cubic-bezier(0.38, 0.7, 0.125, 1)",
}

function attachSheet(el: HTMLElement, input: SheetOptions) {
  const options = withDefaults(input)
  const { host } = options
  const doc = el.ownerDocument
  const view = doc.defaultView ?? window
  const reducedMotion = view.matchMedia?.("(prefers-reduced-motion: reduce)")
  let side: PhysicalSide = resolveSide(options.side(), el)
  let resolved: ResolvedSnapPoint[] = []
  let size = 0
  let physicsSource: Partial<SheetPhysics> | undefined
  let physics: SheetPhysics = sheetPhysics.ios
  let theme: ReturnType<typeof dimThemeColor> | undefined
  let restoreBackdrop: (() => void) | undefined
  const config: SheetConfig = {
    snapPoints: [],
    dimension: 0,
    dismissible: true,
    expandOnScroll: true,
    physics,
    contentScroll,
  }

  const scrollSnap = side === "bottom" && usesScrollSnap(view, options)
  sheets.add(el)
  const restoreStyles = [styleHost(host, side, el), styleSheet(el)]

  let ancestors: HTMLElement[] = []
  const effects = createSheetEffects({
    sheet: el,
    backdrop: options.backdrop,
    dimmed: options.hostBackdrop ? host : undefined,
    outlets: options.outlets,
    ancestors: () => ancestors,
    themeColor: (dim) => theme?.write(dim),
  })

  function readConfig() {
    const source = options.physics()
    if (source !== physicsSource) {
      physicsSource = source
      physics = source ? { ...sheetPhysics.ios, ...source } : sheetPhysics.ios
    }
    config.physics = physics
    config.dismissible = options.dismissible()
    config.expandOnScroll = options.expandOnScroll()
    return config
  }

  let measured = false
  function measure() {
    measured = true
    const nextSide = resolveSide(options.side(), el)
    if (nextSide !== side) {
      side = nextSide
      restoreStyles[0]()
      restoreStyles[0] = styleHost(host, side, el)
    }
    // The scroll-snap host reaches below the screen, under Safari's toolbar.
    const container =
      (isVertical(side) ? host.clientHeight : host.clientWidth) -
      (scrollSnap ? toolbarBleed : 0)
    viewportHeight ??= view.visualViewport?.height
    size = sizeAlong(el, side)
    const rootFontSize =
      parseFloat(view.getComputedStyle(doc.documentElement).fontSize) || 16
    const next = resolveSnapPoints(options.snapPoints(), {
      container,
      content: size,
      rootFontSize,
    })
    if (!next.length) {
      next.push({
        id: "content",
        value: "content",
        extent: size,
        ids: ["content"],
      })
    }
    const changed =
      container !== config.dimension ||
      next.length !== resolved.length ||
      next.some(
        (point, index) =>
          point.id !== resolved[index].id ||
          Math.abs(point.extent - resolved[index].extent) >= 0.5
      )
    resolved = next
    config.dimension = container
    config.snapPoints = resolved.map(({ id, extent }) => ({ id, extent }))
    effects.configure({
      snapExtents: config.snapPoints.map((point) => point.extent),
      undimmedIndex: findSnapIndex(resolved, options.modalAbove()),
    })
    if (changed) {
      reportLayout()
    }
    return changed
  }

  let destroyed = false

  const valueOf = (id: string | null) =>
    id === null
      ? null
      : (resolved.find((point) => point.id === id)?.value ?? null)

  const driverOptions = {
    sheet: el,
    host,
    side: () => side,
    config: readConfig,
    size: () => size,
    closedExtent: () => closedExtentFor(side),
    reducedMotion: () => !!reducedMotion?.matches,
    owns: (target: EventTarget | null) => sheetAt(target) === el,
    canMouseDrag: options.canMouseDrag,
    onSnap: (id: string, reason: SheetSnapReason, event?: Event) => {
      const value = valueOf(id)
      if (value !== null) {
        options.onSnap(value, reason, event)
      }
    },
    onRest(id: string | null) {
      if (destroyed) {
        return
      }
      const point = resolved.find((entry) => entry.id === id)
      effects.apply(point?.extent ?? closedExtentFor(side), { rest: true })
      options.onRest(valueOf(id))
      if (revealAtRest && id !== null) {
        revealFocused()
      }
      revealAtRest = false
    },
    onDismiss: options.onDismiss,
    onDismissAttempt: options.onDismissAttempt,
    onDragChange: options.onDragChange,
    isInteractive: (id: string) => sheet.isInteractiveAt(valueOf(id)),
    onFrame: (extent: number) => destroyed || effects.apply(extent),
    onMotion: (motion: SheetMotion) => destroyed || effects.play(motion),
    onMotionStart: (startTime: number) => destroyed || effects.sync(startTime),
  }

  let attaching = true
  function reportLayout() {
    if (!attaching) {
      return options.onLayout({ side, snapPoints: resolved })
    }
    queueMicrotask(
      () => destroyed || options.onLayout({ side, snapPoints: resolved })
    )
  }

  // Measured as it opens, once the host is in the top layer, since laying it
  // out here too lays out the whole sheet twice. One that doesn't open yet is
  // measured when its size is first observed.
  readConfig()
  const driver: SheetDriver = scrollSnap
    ? createScrollSnapDriver(driverOptions)
    : createPointerDriver(driverOptions)
  el.setAttribute("data-driver", scrollSnap ? "scroll-snap" : "pointer")

  attaching = false
  const observer = new ResizeObserver(() => {
    relayout(false)
  })
  observer.observe(el)
  observer.observe(host)
  let keyboardFrom = 0
  let viewportHeight: number | undefined
  let keyboardSlide: Animation | null = null
  const offKeyboard = trackKeyboard(host, {
    before: () => (keyboardFrom = el.getBoundingClientRect().top),
    after: followKeyboard,
  })
  const offs = [
    offKeyboard,
    // A listener that can cancel touches makes the browser wait for script
    // before it scrolls, so it's added only for a sheet that asks for it.
    ...(options.preventEdgeSwipe()
      ? [
          on(doc, "touchstart", preventEdgeSwipe, {
            capture: true,
            passive: false,
          }),
        ]
      : []),
    ...(isIOS()
      ? [
          on(doc, "touchend", focusWithoutScrolling, {
            capture: true,
            passive: false,
          }),
        ]
      : []),
    on(el, "focusin", revealWhenStill),
  ]

  // The keyboard changed the room above it. The sheet takes its new place at
  // once, so it never passes through the old one, and slides there from where
  // it was drawn with the keyboard's own curve. A sheet taller than the room
  // keeps its height and lets the keyboard cover its bottom, as iOS does; the
  // focused field scrolls into view above the keyboard. Only the keyboard
  // slides it: a pan of the visual viewport, like Safari scrolling a field into
  // view or the page scrolling under the open keyboard, keeps the same height,
  // and the sheet tracks it frame by frame under any slide still running.
  function followKeyboard() {
    relayout(true)
    revealFocused()
    const height = view.visualViewport?.height
    if (height === viewportHeight) {
      return
    }
    viewportHeight = height
    keyboardSlide?.cancel()
    keyboardSlide = null
    const shift = keyboardFrom - el.getBoundingClientRect().top
    if (Math.abs(shift) < 1 || reducedMotion?.matches) {
      return
    }
    keyboardSlide = host.animate(
      { translate: [`0 ${shift}px`, "0 0"] },
      keyboardMotion
    )
  }

  // Keeps iOS Safari's back swipe from starting on the sheet or its backdrop.
  function preventEdgeSwipe(event: TouchEvent) {
    if (!event.cancelable) {
      return
    }
    const touch = event.touches[0]
    if (
      !touch ||
      (touch.clientX > edgeZone && touch.clientX < view.innerWidth - edgeZone)
    ) {
      return
    }
    const target = event.target as Node | null
    if (
      target &&
      (host.contains(target) || options.backdrop()?.contains(target))
    ) {
      event.preventDefault()
    }
  }

  // iOS scrolls the whole page to show a field a tap focuses, even inside a
  // fixed sheet. Focusing it here without scrolling avoids that; the keyboard
  // inset then moves the sheet, and `revealFocused` scrolls only inside it.
  function focusWithoutScrolling(event: TouchEvent) {
    const target = event.target
    if (!(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    )) {
      return
    }
    if (
      !el.contains(target) ||
      target === doc.activeElement ||
      driver.isMoving() ||
      !event.cancelable
    ) {
      return
    }
    event.preventDefault()
    target.focus({ preventScroll: true })
  }

  let revealAtRest = false
  function revealWhenStill() {
    if (driver.isMoving()) {
      revealAtRest = true
    } else {
      revealFocused()
    }
  }

  function revealFocused() {
    const field = doc.activeElement
    if (
      !(field instanceof HTMLElement) ||
      !el.contains(field) ||
      field === el ||
      inNestedLayer(field, el)
    ) {
      return
    }
    const area = scrollAreaAt(field, el, "bottom")
    if (!area) {
      return
    }
    // In layout viewport coordinates, like the boxes: Safari can pan the visual
    // viewport down to show the field, and the page under it doesn't move.
    const visual = view.visualViewport
    const visibleBottom = Math.min(
      area.getBoundingClientRect().bottom,
      visual ? visual.offsetTop + visual.height : view.innerHeight
    )
    const { top, bottom } = field.getBoundingClientRect()
    const margin = 16
    const areaTop = area.getBoundingClientRect().top
    const delta =
      bottom + margin > visibleBottom
        ? bottom + margin - visibleBottom
        : top - margin < areaTop
          ? top - margin - areaTop
          : 0
    if (delta) {
      area.scrollBy({
        top: delta,
        behavior: reducedMotion?.matches ? "instant" : "smooth",
      })
    }
  }

  // A snap point the owner moved to as the resting one left, like a drawer
  // whose new snap points drop it, wins over the nearest.
  function relayout(immediate: boolean) {
    const first = !measured
    if (measure() && !first) {
      driver.relayout(
        immediate,
        resolved[findSnapIndex(resolved, options.snapPoint())]?.id
      )
    }
  }

  function idOf(point: SnapPoint | null) {
    const index = findSnapIndex(resolved, point)
    return resolved[index >= 0 ? index : 0]?.id
  }

  const sheet: Sheet = {
    element: el,
    parent: options.parent,
    open(animate) {
      if (destroyed) {
        return
      }
      ancestors = []
      for (let parent = options.parent(); parent; parent = parent.parent()) {
        ancestors.push(parent.element)
      }
      measure()
      readConfig()
      if (options.themeColor()) {
        theme ??= dimThemeColor(doc, physics.dim)
      }
      if (animate) {
        effects.apply(closedExtentFor(side))
      }
      // The backdrop gets its own layer before the first frame, as the sheet has, so
      // neither is promoted mid-motion.
      restoreBackdrop?.()
      const backdrop = options.backdrop()
      restoreBackdrop =
        backdrop && setStyles(backdrop, { "will-change": "opacity" })
      driver.open(idOf(options.snapPoint()), animate)
    },
    close: () => destroyed || driver.close(),
    snapTo(point, reason) {
      const index = findSnapIndex(resolved, point)
      if (index >= 0 && resolved[index].id !== driver.target()) {
        driver.snapTo(resolved[index].id, reason)
      }
    },
    nudge: () => driver.nudge(),
    snapPoints: () => resolved,
    target: () => valueOf(driver.target()),
    isInteractiveAt: (point) =>
      isAtOrBelow(resolved, point, options.modalAbove()),
    refresh() {
      relayout(false)
    },
    destroy() {
      destroyed = true
      observer.disconnect()
      keyboardSlide?.cancel()
      offs.forEach((off) => off())
      driver.destroy()
      effects.destroy()
      restoreBackdrop?.()
      theme?.restore()
      restoreStyles.forEach((restore) => restore())
      el.removeAttribute("data-driver")
      sheets.delete(el)
    },
  }
  return sheet
}

function styleHost(host: HTMLElement, side: PhysicalSide, sheet: HTMLElement) {
  const vertical = isVertical(side)
  // Read only when it matters: the read styles the sheet before its own writes restyle it.
  const atEnd = vertical
    ? side === "bottom"
    : (side === "right") !==
      (sheet.ownerDocument.defaultView?.getComputedStyle(host).direction ===
        "rtl")
  return setStyles(host, {
    position: "fixed",
    inset: "0 0 var(--keyboard-inset, 0px) 0",
    width: "auto",
    height: "auto",
    "max-width": "none",
    "max-height": "none",
    margin: "0",
    padding: "0",
    border: "0",
    background: "transparent",
    color: "inherit",
    overflow: "visible",
    display: "flex",
    "flex-direction": vertical ? "column" : "row",
    "justify-content": atEnd ? "flex-end" : "flex-start",
    "pointer-events": "none",
  })
}

function styleSheet(sheet: HTMLElement) {
  return setStyles(sheet, {
    "pointer-events": "auto",
    "overscroll-behavior": "contain",
    "will-change": "translate",
  })
}

export {
  attachSheet,
  isDragSurface,
  parentSheet,
  type Sheet,
  sheetLayers,
  type SheetOptions,
}
export type { SheetDriverName } from "./sheet-driver"
export { prepareVariables as prepareSheet } from "./sheet-effects"
export type { SheetKeyframes, SheetOutlet } from "./sheet-effects"
export type { SheetSide } from "./sheet-axis"
