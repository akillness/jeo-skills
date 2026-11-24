// A viewport onto a canvas larger than the screen: a node editor, a
// whiteboard, a map of anything. It pans and zooms one world layer with a
// single transform, and turns screen points into canvas points and back, so
// items keep plain positions however far you scroll. Wheel and trackpad pan,
// Ctrl or ⌘ with the wheel and trackpad pinch zoom at the pointer, a drag on
// empty space pans, two fingers pinch, and the keys zoom too.
import type { PrimitiveContext } from "../kernel/primitive-types"
import { announce } from "../platform/announce"

/**
 * Where the canvas sits on screen: its origin's offset from the surface's top left, in CSS pixels, and its scale.
 * @experimental
 */
type Viewport = { x: number; y: number; zoom: number }

/**
 * A box on the canvas, in canvas units.
 * @experimental
 */
type CanvasRect = { left: number; top: number; right: number; bottom: number }

/**
 * Why the viewport moved.
 * @experimental
 */
type ViewportReason =
  | "wheel"
  | "drag"
  | "pinch"
  | "zoom-key"
  | "focus-in"
  | "find-in-page"
  | "imperative"

/**
 * How `createViewport` keeps the viewport.
 * @experimental
 */
type ViewportOptions<State extends object> = {
  /** The state key that holds the `Viewport`. List it in `live`, so panning renders nothing. */
  key: keyof State & string
  /** The element that clips the canvas and takes the gestures. */
  surface: () => HTMLElement | null | undefined
  /** Asks for a new viewport. Defaults to setting the state key; pass the primitive's change to make it controllable. */
  set?: (
    value: Viewport,
    details: { reason: ViewportReason; event?: Event }
  ) => boolean
  /** @defaultValue 0.1 */
  minZoom?: () => number
  /** @defaultValue 4 */
  maxZoom?: () => number
  /** What screen readers hear after a zoom key. Defaults to English, like "Zoom 150%". */
  message?: (zoom: number) => string
}

// How far a findable surface rests from its scroll origin, so the browser can
// scroll it toward anything on the canvas, whichever way it lies.
const rest = 100_000

const wheelUnit = (event: WheelEvent, surface: HTMLElement) =>
  event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1

/**
 * Pans and zooms a canvas. Call it once in `api` and keep it on the api.
 * Put every item in one world element and give it `style(state)`; position
 * the items inside it in canvas units:
 *
 * ```ts
 * surface: slot({
 *   attrs: () => ({ style: css({ position: "relative", overflow: "hidden", "touch-action": "none" }) }),
 *   on: {
 *     wheel: (event, { api }) => api.viewport.wheel(event),
 *     pointerdown: (event, { el, api }) => event.target === el && api.viewport.pointerdown(event),
 *   },
 * }),
 * world: slot({ live: live((state, { api }) => ({ style: api.viewport.style(state) })) }),
 * ```
 *
 * `toCanvas` and `toScreen` convert points, `fit` shows a box, `reveal`
 * scrolls the least to bring one into view, which a focused item calls, and
 * `bindFindable` pans to whatever the browser scrolls to, like a find in page match.
 * @experimental
 */
function createViewport<State extends object>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: ViewportOptions<State>
) {
  const { store } = context
  const minZoom = () => options.minZoom?.() ?? 0.1
  const maxZoom = () => options.maxZoom?.() ?? 4
  const clampZoom = (zoom: number) =>
    Math.min(maxZoom(), Math.max(minZoom(), zoom))
  const set = (
    value: Viewport,
    details: { reason: ViewportReason; event?: Event }
  ) =>
    options.set
      ? options.set(value, details)
      : (store.set({ [options.key]: value } as Partial<State>), true)
  const origin = () => {
    const box = options.surface()?.getBoundingClientRect()
    return {
      left: box?.left ?? 0,
      top: box?.top ?? 0,
      width: box?.width ?? 0,
      height: box?.height ?? 0,
    }
  }
  // Pointers pressed on the surface, for drag and pinch.
  const pointers = new Map<number, { x: number; y: number }>()
  let gesture: {
    center: { x: number; y: number }
    distance: number
    view: Viewport
  } | null = null
  let stop: (() => void) | undefined
  context.onDestroy(() => stop?.())
  // The pane `bindFindable` keeps at rest, and where it rests, which the world's `style` offsets by.
  let findable: HTMLElement | undefined
  let rested = { x: 0, y: 0 }
  const restyle = () =>
    store.set({ [options.key]: { ...api.get() } } as Partial<State>)

  const api = {
    /** The viewport now. */
    get() {
      return (store.get()[options.key] ?? { x: 0, y: 0, zoom: 1 }) as Viewport
    },
    /** A point on screen, like a pointer's `clientX` and `clientY`, in canvas units. */
    toCanvas(clientX: number, clientY: number) {
      const { x, y, zoom } = api.get()
      const box = origin()
      return {
        x: (clientX - box.left - x) / zoom,
        y: (clientY - box.top - y) / zoom,
      }
    },
    /** A canvas point on screen, in client pixels. */
    toScreen(point: { x: number; y: number }) {
      const { x, y, zoom } = api.get()
      const box = origin()
      return {
        x: point.x * zoom + x + box.left,
        y: point.y * zoom + y + box.top,
      }
    },
    /** Where an element is on the canvas, like a port inside a node, from its box on screen. */
    rectOf(el: Element) {
      const box = el.getBoundingClientRect()
      const a = api.toCanvas(box.left, box.top)
      const b = api.toCanvas(box.right, box.bottom)
      return { left: a.x, top: a.y, right: b.x, bottom: b.y }
    },
    /** The part of the canvas on screen now. */
    visible() {
      const { x, y, zoom } = api.get()
      const box = origin()
      return {
        left: -x / zoom,
        top: -y / zoom,
        right: (box.width - x) / zoom,
        bottom: (box.height - y) / zoom,
      }
    },
    /** Moves to a viewport, keeping the zoom within bounds. */
    setViewport(
      value: Viewport,
      details: { reason: ViewportReason; event?: Event } = {
        reason: "imperative",
      }
    ) {
      const next = { x: value.x, y: value.y, zoom: clampZoom(value.zoom) }
      const now = api.get()
      if (next.x === now.x && next.y === now.y && next.zoom === now.zoom) {
        return false
      }
      return set(next, details)
    },
    /** Pans by screen pixels. */
    panBy(
      dx: number,
      dy: number,
      details: { reason: ViewportReason; event?: Event } = {
        reason: "imperative",
      }
    ) {
      const { x, y, zoom } = api.get()
      return api.setViewport({ x: x + dx, y: y + dy, zoom }, details)
    },
    /** Zooms to a scale, keeping the canvas point under a screen point still. Defaults to the surface's center. */
    zoomTo(
      zoom: number,
      at?: { x: number; y: number },
      details: { reason: ViewportReason; event?: Event } = {
        reason: "imperative",
      }
    ) {
      const view = api.get()
      const box = origin()
      const px = (at?.x ?? box.left + box.width / 2) - box.left
      const py = (at?.y ?? box.top + box.height / 2) - box.top
      const next = clampZoom(zoom)
      const k = next / view.zoom
      return api.setViewport(
        { x: px - (px - view.x) * k, y: py - (py - view.y) * k, zoom: next },
        details
      )
    },
    /** Zooms by a factor, like `1.2` in and `1 / 1.2` out. */
    zoomBy(
      factor: number,
      at?: { x: number; y: number },
      details: { reason: ViewportReason; event?: Event } = {
        reason: "imperative",
      }
    ) {
      return api.zoomTo(api.get().zoom * factor, at, details)
    },
    /** Shows a canvas box whole and centered, zooming no further in than `maxZoom`. */
    fit(
      rect: CanvasRect,
      fitOptions: { padding?: number; maxZoom?: number } = {},
      details: { reason: ViewportReason; event?: Event } = {
        reason: "imperative",
      }
    ) {
      const box = origin()
      const padding = fitOptions.padding ?? 32
      const width = Math.max(rect.right - rect.left, 1)
      const height = Math.max(rect.bottom - rect.top, 1)
      const zoom = clampZoom(
        Math.min(
          (box.width - padding * 2) / width,
          (box.height - padding * 2) / height,
          fitOptions.maxZoom ?? 1
        )
      )
      return api.setViewport(
        {
          x: box.width / 2 - (rect.left + width / 2) * zoom,
          y: box.height / 2 - (rect.top + height / 2) * zoom,
          zoom,
        },
        details
      )
    },
    /** Pans the least distance that brings a canvas box into view, with `padding` screen pixels around it. */
    reveal(
      rect: CanvasRect,
      revealOptions: { padding?: number } = {},
      details: { reason: ViewportReason; event?: Event } = {
        reason: "focus-in",
      }
    ) {
      const { zoom } = api.get()
      const seen = api.visible()
      const pad = (revealOptions.padding ?? 24) / zoom
      const shift = (low: number, high: number, from: number, to: number) =>
        high - low > to - from - pad * 2
          ? (from + to) / 2 - (low + high) / 2
          : low < from + pad
            ? from + pad - low
            : high > to - pad
              ? to - pad - high
              : 0
      const dx = shift(rect.left, rect.right, seen.left, seen.right)
      const dy = shift(rect.top, rect.bottom, seen.top, seen.bottom)
      return dx || dy ? api.panBy(dx * zoom, dy * zoom, details) : false
    },
    /** Pans with the wheel or a two finger scroll; zooms at the pointer with Ctrl or ⌘, and with a trackpad pinch, which browsers send as Ctrl. */
    wheel(event: WheelEvent) {
      const surface = options.surface()
      if (!surface) {
        return
      }
      event.preventDefault()
      const unit = wheelUnit(event, surface)
      if (event.ctrlKey || event.metaKey) {
        const delta = Math.max(-50, Math.min(50, event.deltaY * unit))
        api.zoomBy(
          Math.exp(-delta * 0.01),
          { x: event.clientX, y: event.clientY },
          { reason: "wheel", event }
        )
      } else {
        api.panBy(-event.deltaX * unit, -event.deltaY * unit, {
          reason: "wheel",
          event,
        })
      }
    },
    /** Pans while one pointer drags the surface, and pinches with two. Call it for presses on empty space. */
    pointerdown(event: PointerEvent) {
      const surface = options.surface()
      if (
        !surface ||
        (event.pointerType === "mouse" &&
          event.button !== 0 &&
          event.button !== 1)
      ) {
        return
      }
      event.preventDefault()
      try {
        surface.setPointerCapture(event.pointerId)
      } catch {
        // Synthetic events have no active pointer to capture.
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const begin = () => {
        const points = [...pointers.values()]
        const center = {
          x: points.reduce((s, p) => s + p.x, 0) / points.length,
          y: points.reduce((s, p) => s + p.y, 0) / points.length,
        }
        const distance =
          points.length > 1
            ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
            : 0
        gesture = { center, distance, view: api.get() }
      }
      begin()
      if (pointers.size > 1) {
        return
      }
      const move = (e: PointerEvent) => {
        if (!pointers.has(e.pointerId) || !gesture) {
          return
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const points = [...pointers.values()]
        const center = {
          x: points.reduce((s, p) => s + p.x, 0) / points.length,
          y: points.reduce((s, p) => s + p.y, 0) / points.length,
        }
        const { view } = gesture
        if (points.length > 1 && gesture.distance) {
          const distance = Math.hypot(
            points[0].x - points[1].x,
            points[0].y - points[1].y
          )
          const zoom = clampZoom(view.zoom * (distance / gesture.distance))
          const box = origin()
          // The canvas point under the fingers' first center follows the center.
          const cx = (gesture.center.x - box.left - view.x) / view.zoom
          const cy = (gesture.center.y - box.top - view.y) / view.zoom
          api.setViewport(
            {
              x: center.x - box.left - cx * zoom,
              y: center.y - box.top - cy * zoom,
              zoom,
            },
            { reason: "pinch", event: e }
          )
        } else {
          api.setViewport(
            {
              x: view.x + center.x - gesture.center.x,
              y: view.y + center.y - gesture.center.y,
              zoom: view.zoom,
            },
            { reason: "drag", event: e }
          )
        }
      }
      const up = (e: PointerEvent) => {
        pointers.delete(e.pointerId)
        if (pointers.size) {
          begin()
        } else {
          end()
        }
      }
      const end = () => {
        pointers.clear()
        gesture = null
        surface.removeEventListener("pointermove", move)
        surface.removeEventListener("pointerup", up)
        surface.removeEventListener("pointercancel", up)
        stop = undefined
      }
      surface.addEventListener("pointermove", move)
      surface.addEventListener("pointerup", up)
      surface.addEventListener("pointercancel", up)
      stop = end
    },
    /** `+` and `-` zoom at the center, `0` goes back to 100%. Returns whether it handled the key. */
    keydown(event: KeyboardEvent, at?: { x: number; y: number }) {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return false
      }
      const factor =
        event.key === "+" || event.key === "="
          ? 1.25
          : event.key === "-" || event.key === "_"
            ? 0.8
            : event.key === "0"
              ? 0
              : undefined
      if (factor === undefined) {
        return false
      }
      event.preventDefault()
      const done = factor
        ? api.zoomBy(factor, at, { reason: "zoom-key", event })
        : api.zoomTo(1, at, { reason: "zoom-key", event })
      if (done) {
        announce(
          options.message?.(api.get().zoom) ??
            `Zoom ${Math.round(api.get().zoom * 100)}%`
        )
      }
      return true
    },
    /** The world element's `style`: one transform for every item, so panning lays nothing out. */
    style(state: State) {
      const { x, y, zoom } = (state[options.key] ?? {
        x: 0,
        y: 0,
        zoom: 1,
      }) as Viewport
      const at = findable ? rested : { x: 0, y: 0 }
      return `transform:translate(${x + at.x}px,${y + at.y}px) scale(${zoom});transform-origin:0 0;--canvas-zoom:${zoom}`
    },
    /**
     * Turns the browser's scrolls inside `el` into pans, until the returned
     * function runs, so find in page, focus and links to an id bring what
     * they found into view. `el` is a pane that fills the surface and holds
     * only the world, with `overflow: scroll`, since find in page skips what a
     * user can't scroll: it rests scrolled far from its origin, with the world
     * offset to match.
     */
    bindFindable(el: HTMLElement) {
      const spacer = el.ownerDocument.createElement("div")
      spacer.setAttribute("aria-hidden", "true")
      // On the pane's end side, which right to left puts on the left, so there's room to scroll toward.
      Object.assign(spacer.style, {
        position: "absolute",
        insetInlineStart: `${rest * 2}px`,
        insetBlockStart: `${rest * 2}px`,
        width: "1px",
        height: "1px",
        visibility: "hidden",
        pointerEvents: "none",
      })
      // The world moves by where the pane really rests, which is nowhere while
      // it can't scroll, like hidden in a closed tab, and negative right to left.
      let bound = true
      let frame = 0
      const settle = () => {
        if (!bound) {
          return
        }
        if (!spacer.isConnected) {
          el.append(spacer)
        }
        const rtl =
          el.ownerDocument.defaultView?.getComputedStyle(el).direction === "rtl"
        el.scrollLeft = rtl ? -rest : rest
        el.scrollTop = rest
        const at = { x: el.scrollLeft, y: el.scrollTop }
        if (at.x === rested.x && at.y === rested.y) {
          return
        }
        rested = at
        restyle()
      }
      // Focus scrolls as it moves, and the scroll arrives before the next frame.
      let focusing = false
      const onFocusIn = () => {
        focusing = true
        requestAnimationFrame(() => (focusing = false))
      }
      const onScroll = (event: Event) => {
        // Without the spacer, like after a framework replaced the children, or
        // back at the origin, like after the pane was hidden, the rest was lost.
        if (!spacer.isConnected || (!el.scrollLeft && !el.scrollTop)) {
          return settle()
        }
        const dx = el.scrollLeft - rested.x
        const dy = el.scrollTop - rested.y
        if (!dx && !dy) {
          return
        }
        settle()
        api.panBy(-dx, -dy, {
          reason: focusing ? "focus-in" : "find-in-page",
          event,
        })
        // Chrome ignores the reset during a find in page scroll; the rest takes it, and goes back once the scroll is done.
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(settle)
      }
      findable = el
      rested = { x: 0, y: 0 }
      settle()
      el.addEventListener("scroll", onScroll)
      el.addEventListener("focusin", onFocusIn)
      // A hidden pane, like in a closed tab or dialog, can't scroll: it rests once it shows, before it paints.
      const view = el.ownerDocument.defaultView
      const sized = view?.ResizeObserver
        ? new view.ResizeObserver(settle)
        : undefined
      sized?.observe(el)
      return () => {
        bound = false
        cancelAnimationFrame(frame)
        sized?.disconnect()
        el.removeEventListener("scroll", onScroll)
        el.removeEventListener("focusin", onFocusIn)
        spacer.remove()
        if (findable !== el) {
          return
        }
        findable = undefined
        rested = { x: 0, y: 0 }
        el.scrollLeft = 0
        el.scrollTop = 0
        restyle()
      }
    },
  }
  return api
}

export {
  type CanvasRect,
  createViewport,
  type Viewport,
  type ViewportOptions,
  type ViewportReason,
}
