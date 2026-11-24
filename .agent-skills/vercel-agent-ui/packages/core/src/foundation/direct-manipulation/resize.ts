// Resizing boxes by their edges and corners: a crop on an image, a window on
// a desktop, a widget on a dashboard. A pointer drags a handle, or the box
// itself to move it, through a draft box in state that core writes straight
// to the element as custom properties, so a drag renders nothing; the drop
// commits once. Arrows on a focused handle move its edges, and screen readers
// hear the new size.
import type { PrimitiveContext } from "../kernel/primitive-types"
import { css } from "../kernel/inline-style"
import { announce } from "../platform/announce"
import { clamp } from "../../foundation/number/steps"
import { createDragSession, dragThreshold } from "../drag-and-drop/pointer"

/**
 * Where a box sits and how big it is, in the units your boxes use, usually CSS pixels.
 * @experimental
 */
type ResizeBox = { x: number; y: number; width: number; height: number }

/**
 * The edge or corner a handle drags, by compass point, or `move` for the whole box.
 * @experimental
 */
type ResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw" | "move"

/**
 * The box a pointer is changing, kept in state under `ResizeOptions.draft`.
 * @experimental
 */
type ResizeDraft = { key: string; handle: ResizeHandle; box: ResizeBox }

/**
 * Why a box changed: a pointer drag, a key on a handle, or a call from code.
 * @experimental
 */
type ResizeReason = "drag" | "resize-key" | "imperative"

/**
 * What happened, for the message screen readers hear.
 * @experimental
 */
type ResizeMessage = {
  key: string
  label: string
  handle: ResizeHandle
  box: ResizeBox
}

/**
 * How `createResize` reads and changes boxes.
 * @experimental
 */
type ResizeOptions<State extends object> = {
  /** Every box in state, by key, like `(state) => state.boxes` or `(state) => ({ crop: state.crop })`. */
  boxes: (state: State) => Record<string, ResizeBox>
  /** The state key that holds the `ResizeDraft` while a pointer drags. Start it at `null`, and list it in `live`. */
  draft: keyof State & string
  /**
   * Asks for new boxes and returns whether they went through. Pass the
   * primitive's change: `set: (value, details) => change("boxes", value, details)`,
   * or `change("crop", value.crop, details)` for a primitive with one box.
   */
  set: (
    value: Record<string, ResizeBox>,
    details: { reason: ResizeReason; event?: Event }
  ) => boolean
  /** The smallest a box gets. Defaults to 1 by 1. */
  min?: (key: string) => { width: number; height: number }
  /** The largest a box gets. */
  max?: (key: string) => { width: number; height: number } | undefined
  /** Keeps a box inside an area, like the image a crop sits on. */
  bounds?: (
    key: string
  ) => { left: number; top: number; right: number; bottom: number } | undefined
  /**
   * Keeps width over height at this ratio, like `16 / 9`. Without one, Shift
   * on a corner keeps the ratio the box had when the drag started.
   */
  aspect?: (key: string) => number | undefined
  /** The grid a dropped box lands on, and how far an arrow moves an edge. Defaults to 1. */
  step?: () => number
  /** How far Shift with an arrow moves an edge. Defaults to ten steps. */
  largeStep?: () => number
  /** How many screen pixels one unit takes, like a canvas's zoom. Defaults to 1. */
  scale?: () => number
  /** Whether a box can't be changed. */
  disabled?: (key: string) => boolean
  /** The name screen readers hear for a box. */
  label?: (key: string) => string | undefined
  /** The text screen readers hear after a change. Defaults to English. */
  message?: (message: ResizeMessage) => string
}

/**
 * The English messages `createResize` announces unless you pass `message`.
 * @experimental
 */
function resizeMessage({ label, handle, box }: ResizeMessage) {
  return handle === "move"
    ? `${label} moved to ${box.x}, ${box.y}.`
    : `${label} resized to ${box.width} by ${box.height}.`
}

/** The cursor that shows what each handle does. */
const resizeCursors: Record<ResizeHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  move: "move",
}

const arrows: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

// Handles sit inside their box, so the box's own `move` listener sees their events too.
const fromHandle = (event: Event, handle: ResizeHandle) =>
  handle === "move" &&
  !!(event.target as Element | null)?.closest?.("[data-resize-handle]")

/**
 * The limits `resizeBox` keeps a box within.
 */
type ResizeLimits = {
  /** The area the box stays inside. */
  bounds?: { left: number; top: number; right: number; bottom: number }
  /** The smallest it gets. Defaults to 1 by 1. */
  min?: { width: number; height: number }
  /** The largest it gets. */
  max?: { width: number; height: number }
  /** Width over height, kept while it resizes. */
  aspect?: number
}

/**
 * The box a handle makes when its edges move by `dx` and `dy` from `from`,
 * within the limits, as a drag of that handle makes it.
 */
function resizeBox(
  from: ResizeBox,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  limits: ResizeLimits = {}
) {
  const area = limits.bounds
  const left = area?.left ?? -Infinity
  const top = area?.top ?? -Infinity
  const right = area?.right ?? Infinity
  const bottom = area?.bottom ?? Infinity
  if (handle === "move") {
    return {
      ...from,
      x: clamp(from.x + dx, left, Math.max(left, right - from.width)),
      y: clamp(from.y + dy, top, Math.max(top, bottom - from.height)),
    }
  }
  const min = limits.min ?? { width: 1, height: 1 }
  const max = limits.max ?? { width: Infinity, height: Infinity }
  const west = handle.includes("w")
  const east = handle.includes("e")
  const north = handle.includes("n")
  const south = handle.includes("s")
  // The edges that stay put, and how far the moving ones may go.
  const anchorX = west ? from.x + from.width : from.x
  const anchorY = north ? from.y + from.height : from.y
  const roomX = Math.min(max.width, west ? anchorX - left : right - anchorX)
  const roomY = Math.min(max.height, north ? anchorY - top : bottom - anchorY)
  let width = west ? from.width - dx : east ? from.width + dx : from.width
  let height = north ? from.height - dy : south ? from.height + dy : from.height
  const ratio = limits.aspect
  if (ratio) {
    // A corner follows whichever edge moved further; an edge sets the other side.
    if ((west || east) && (north || south)) {
      if (
        Math.abs(width / from.width - 1) >= Math.abs(height / from.height - 1)
      ) {
        height = width / ratio
      } else {
        width = height * ratio
      }
    } else if (west || east) {
      height = width / ratio
    } else {
      width = height * ratio
    }
    // An edge grows the other side about the box's middle, so it has room on both sides of it.
    const middleY = from.y + from.height / 2
    const middleX = from.x + from.width / 2
    const fitY =
      north || south
        ? roomY
        : 2 * Math.min(middleY - top, bottom - middleY, max.height / 2)
    const fitX =
      west || east
        ? roomX
        : 2 * Math.min(middleX - left, right - middleX, max.width / 2)
    width = clamp(
      width,
      Math.max(min.width, min.height * ratio),
      Math.min(fitX, fitY * ratio)
    )
    height = width / ratio
  } else {
    width = clamp(width, min.width, Math.max(min.width, roomX))
    height = clamp(height, min.height, Math.max(min.height, roomY))
  }
  const x = west
    ? anchorX - width
    : east
      ? anchorX
      : from.x + (from.width - width) / 2
  const y = north
    ? anchorY - height
    : south
      ? anchorY
      : from.y + (from.height - height) / 2
  return { x, y, width, height }
}

/**
 * Lets users resize a slot's parts by handles on their edges and corners, and
 * move them by dragging the box. Call it once in `api`, keep it on the api,
 * and wire the box and its handles:
 *
 * ```ts
 * box: slot<{ value: string }>({
 *   attrs: (state, { key, api }) => ({ style: api.resize.boxStyle(state, key) }),
 *   live: live((state, { key, api }) => ({ style: api.resize.style(state, key) })),
 *   on: { pointerdown: (event, { el, api, key }) => api.resize.pointerdown(event, key, "move", el!) },
 * }),
 * // Each handle is its own part, so give it an `id` like `${box}-${handle}`.
 * handle: slot<{ id: string; box: string; handle: ResizeHandle }>({
 *   attrs: (_state, { props, api }) => api.resize.handleAttrs(props.handle),
 *   on: {
 *     pointerdown: (event, { el, api, props }) => api.resize.pointerdown(event, props.box, props.handle, el!),
 *     keydown: (event, { api, props }) => api.resize.keydown(event, props.box, props.handle),
 *   },
 * }),
 * ```
 *
 * `boxStyle` places the box from state with `left`, `top`, `width` and
 * `height` that read `--resize-x`, `--resize-y`, `--resize-width` and
 * `--resize-height` first, which `style` sets while a pointer drags.
 * @experimental
 */
function createResize<State extends object>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: ResizeOptions<State>
) {
  const { store } = context
  const boxes = () => options.boxes(store.get())
  const setDraft = (draft: ResizeDraft | null) =>
    store.set({ [options.draft]: draft } as Partial<State>)
  const drags = createDragSession(context.onDestroy)

  const fit = (
    key: string,
    from: ResizeBox,
    handle: ResizeHandle,
    dx: number,
    dy: number,
    keepRatio: boolean
  ) =>
    resizeBox(from, handle, dx, dy, {
      bounds: options.bounds?.(key),
      min: options.min?.(key),
      max: options.max?.(key),
      aspect:
        options.aspect?.(key) ??
        (keepRatio ? from.width / from.height : undefined),
    })

  const round = (box: ResizeBox, size: number) => ({
    x: Math.round(box.x / size) * size,
    y: Math.round(box.y / size) * size,
    width: Math.round(box.width / size) * size,
    height: Math.round(box.height / size) * size,
  })

  const api = {
    /** The box as it shows now: the draft's while a pointer drags it, else the one in state. */
    box(state: State, key: string) {
      const draft = state[options.draft] as ResizeDraft | null
      return draft?.key === key
        ? draft.box
        : (options.boxes(state)[key] ?? null)
    },
    /** Sets a box, in one change. Returns whether it went through. */
    resizeTo(
      key: string,
      box: ResizeBox,
      details: { reason: ResizeReason; event?: Event } = {
        reason: "imperative",
      },
      handle: ResizeHandle = "se"
    ) {
      const current = boxes()[key]
      if (
        current &&
        current.x === box.x &&
        current.y === box.y &&
        current.width === box.width &&
        current.height === box.height
      ) {
        return false
      }
      const done = options.set({ ...boxes(), [key]: box }, details)
      if (done) {
        announce(
          (options.message ?? resizeMessage)({
            key,
            label: options.label?.(key) ?? key,
            handle,
            box,
          }),
          { priority: "assertive" }
        )
      }
      return done
    },
    /** Moves a handle's edges by an offset, within the limits, like an arrow key does. */
    resizeBy(
      key: string,
      handle: ResizeHandle,
      dx: number,
      dy: number,
      details: { reason: ResizeReason; event?: Event } = {
        reason: "imperative",
      }
    ) {
      const from = boxes()[key]
      if (!from || options.disabled?.(key)) {
        return false
      }
      return api.resizeTo(
        key,
        fit(key, from, handle, dx, dy, false),
        details,
        handle
      )
    },
    /** Arrows move the handle's edges, or the box for `move`. Returns whether it handled the key. */
    keydown(event: KeyboardEvent, key: string, handle: ResizeHandle) {
      const direction = arrows[event.key]
      if (
        !direction ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        fromHandle(event, handle)
      ) {
        return false
      }
      // An edge handle moves along its own axis only.
      const [x, y] = direction
      if (
        (x && (handle === "n" || handle === "s")) ||
        (y && (handle === "e" || handle === "w"))
      ) {
        return false
      }
      event.preventDefault()
      const step = options.step?.() ?? 1
      const by = event.shiftKey ? (options.largeStep?.() ?? step * 10) : step
      api.resizeBy(key, handle, x * by, y * by, { reason: "resize-key", event })
      return true
    },
    /** Starts a drag of a handle, or of the box with `move`, once the pointer moves past `dragThreshold`. */
    pointerdown(
      event: PointerEvent,
      key: string,
      handle: ResizeHandle,
      el: HTMLElement
    ) {
      const from = boxes()[key]
      if (
        !from ||
        !drags.accepts(event) ||
        options.disabled?.(key) ||
        fromHandle(event, handle)
      ) {
        return
      }
      // Offsets count from the press, so the edge keeps up with the pointer past the threshold.
      const startX = event.clientX
      const startY = event.clientY
      drags.start(el, event, {
        threshold: dragThreshold,
        cancelOnEscape: true,
        onStart: () => {
          setDraft({ key, handle, box: from })
        },
        onMove: ({ x, y, event: move }) => {
          const scale = options.scale?.() ?? 1
          const box = fit(
            key,
            from,
            handle,
            (x - startX) / scale,
            (y - startY) / scale,
            move.shiftKey
          )
          setDraft({ key, handle, box })
        },
        onEnd: (endEvent, canceled) => {
          const draft = store.get()[options.draft] as ResizeDraft | null
          setDraft(null)
          if (draft && !canceled) {
            api.resizeTo(
              key,
              round(draft.box, options.step?.() ?? 1),
              { reason: "drag", event: endEvent },
              handle
            )
          }
        },
      })
    },
    /** The handle being dragged on a box, if any. */
    dragging(state: State, key: string) {
      const draft = state[options.draft] as ResizeDraft | null
      return draft?.key === key ? draft.handle : undefined
    },
    /**
     * Places the box from state, as a `style` attribute for its `attrs`. Each
     * side reads its custom property first, which `style` sets during a drag.
     */
    boxStyle(state: State, key: string) {
      const box = options.boxes(state)[key]
      if (!box) {
        return undefined
      }
      return css({
        position: "absolute",
        left: `var(--resize-x, ${box.x}px)`,
        top: `var(--resize-y, ${box.y}px)`,
        width: `var(--resize-width, ${box.width}px)`,
        height: `var(--resize-height, ${box.height}px)`,
      })
    },
    /** The dragged box, as custom properties for the box slot's `live`, or `undefined`. */
    style(state: State, key: string) {
      const draft = state[options.draft] as ResizeDraft | null
      if (draft?.key !== key) {
        return undefined
      }
      const { x, y, width, height } = draft.box
      return `--resize-x:${x}px;--resize-y:${y}px;--resize-width:${width}px;--resize-height:${height}px`
    },
    /** A handle's attributes: `data-resize-handle`, its cursor, and no touch scrolling. */
    handleAttrs(handle: ResizeHandle) {
      return {
        "data-resize-handle": handle,
        style: css({ cursor: resizeCursors[handle], "touch-action": "none" }),
      }
    },
  }
  return api
}

/**
 * What `createResize` returns.
 * @experimental
 */
type Resize = ReturnType<typeof createResize>

export {
  createResize,
  type Resize,
  type ResizeBox,
  resizeBox,
  resizeCursors,
  type ResizeDraft,
  type ResizeHandle,
  type ResizeLimits,
  resizeMessage,
  type ResizeMessage,
  type ResizeOptions,
  type ResizeReason,
}
