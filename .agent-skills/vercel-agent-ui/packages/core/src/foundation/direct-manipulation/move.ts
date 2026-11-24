// Moving items in two dimensions: cards on a board, nodes on a canvas, windows
// on a desktop. A pointer drags one item, or every selected item with it,
// through a draft offset in state that core writes straight to the elements,
// so a drag renders nothing; the drop commits every position in one change,
// and Escape puts them back.
// The keyboard nudges with Alt and the arrows, and screen readers hear where
// each item went.
import type { PrimitiveContext } from "../kernel/primitive-types"
import { announce } from "../platform/announce"
import { createDragSession, dragThreshold } from "../drag-and-drop/pointer"

/**
 * Where an item is, in the units your positions use, usually CSS pixels.
 * @experimental
 */
type MovePoint = { x: number; y: number }

/**
 * The items a pointer is dragging and how far, kept in state under `MoveOptions.draft`.
 * @experimental
 */
type MoveDraft = { keys: string[]; dx: number; dy: number }

/**
 * Why positions changed: a pointer drag, a keyboard nudge, or a call from code.
 * @experimental
 */
type MoveReason = "drag" | "move-key" | "imperative"

/**
 * What happened, for the message screen readers hear.
 * @experimental
 */
type MoveMessage = {
  /** The keys that moved. */
  keys: string[]
  /** What the first is called, from `label`, else its key. */
  label: string
  /** Where the first is now. */
  at: MovePoint
}

/**
 * How `createMove` reads and changes positions.
 * @experimental
 */
type MoveOptions<State extends object> = {
  /** The state key that holds every item's position, a `Record<string, MovePoint>`. */
  key: keyof State & string
  /** The state key that holds the `MoveDraft` while a pointer drags. Start it at `null`, and list it in `live`. */
  draft: keyof State & string
  /**
   * Asks for new positions and returns whether they went through. Pass the
   * primitive's change: `set: (value, details) => change("positions", value, details)`.
   */
  set: (
    value: Record<string, MovePoint>,
    details: { reason: MoveReason; event?: Event }
  ) => boolean
  /** The keys that move together with the one pressed, like the selection when it holds it. Defaults to that one key. */
  group?: (key: string) => string[]
  /** The grid a dropped position lands on, and how far Alt with an arrow nudges. Defaults to 1. */
  step?: () => number
  /** How far Alt with Shift and an arrow nudges. Defaults to ten steps. */
  largeStep?: () => number
  /**
   * How many screen pixels one unit of position takes, like a canvas's zoom,
   * so a drag follows the pointer when the items are scaled. Defaults to 1.
   */
  scale?: () => number
  /** Keeps positions inside a box, like the board's size minus a card's. */
  bounds?: (
    key: string
  ) => { minX: number; minY: number; maxX: number; maxY: number } | undefined
  /** Whether an item can't be moved. */
  disabled?: (key: string) => boolean
  /** The name screen readers hear for an item. */
  label?: (key: string) => string | undefined
  /** The text screen readers hear after a move. Defaults to English. */
  message?: (message: MoveMessage) => string
}

/**
 * The English messages `createMove` announces unless you pass `message`.
 * @experimental
 */
function moveMessage({ keys, label, at }: MoveMessage) {
  return `${keys.length > 1 ? `${keys.length} items` : label} moved to ${at.x}, ${at.y}.`
}

const arrows: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

/**
 * Lets users move a slot's parts in two dimensions, by dragging them and
 * with Alt and the arrows. Call it once in `api`, keep it on the api, and
 * wire the item slot:
 *
 * ```ts
 * card: slot<{ value: string }>({
 *   attrs: (state, { key }) => ({ style: css({ left: `${state.positions[key].x}px`, top: `${state.positions[key].y}px` }) }),
 *   live: live((state, { key, api }) => ({ style: api.move.style(state, key) })),
 *   on: {
 *     keydown: (event, { el, api, key }) => api.move.keydown(event, key) || api.roving.keydown(event, el!),
 *     pointerdown: (event, { el, api, key }) => api.move.pointerdown(event, key, el!),
 *   },
 * })
 * ```
 *
 * While a pointer drags, `style(state, key)` gives the dragged items a
 * `translate` and `--move-x` and `--move-y`, and `dragging(state, key)` says
 * which are moving. The drop commits once, with every moved key, through `set`.
 * @experimental
 */
function createMove<State extends object>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: MoveOptions<State>
) {
  const { store } = context
  const positions = () =>
    (store.get()[options.key] ?? {}) as Record<string, MovePoint>
  const setDraft = (draft: MoveDraft | null) =>
    store.set({ [options.draft]: draft } as Partial<State>)
  const drags = createDragSession(context.onDestroy)

  const group = (key: string) =>
    (options.group?.(key) ?? [key]).filter((k) => !options.disabled?.(k))
  const place = (key: string, x: number, y: number, round: number) => {
    let point = {
      x: Math.round(x / round) * round,
      y: Math.round(y / round) * round,
    }
    const box = options.bounds?.(key)
    if (box) {
      point = {
        x: Math.min(box.maxX, Math.max(box.minX, point.x)),
        y: Math.min(box.maxY, Math.max(box.minY, point.y)),
      }
    }
    return point
  }

  const api = {
    /** Moves items by an offset, in one change. Returns whether it went through. */
    moveBy(
      keys: string[],
      dx: number,
      dy: number,
      details: { reason: MoveReason; event?: Event } = { reason: "imperative" }
    ) {
      const current = positions()
      const next = { ...current }
      const round =
        details.reason === "imperative" ? 1 : (options.step?.() ?? 1)
      for (const key of keys) {
        const at = current[key] ?? { x: 0, y: 0 }
        next[key] = place(key, at.x + dx, at.y + dy, round)
      }
      if (
        keys.every(
          (key) =>
            next[key].x === current[key]?.x && next[key].y === current[key]?.y
        )
      ) {
        return false
      }
      const done = options.set(next, details)
      if (done && keys.length) {
        const label = options.label?.(keys[0]) ?? keys[0]
        announce(
          (options.message ?? moveMessage)({ keys, label, at: next[keys[0]] }),
          {
            priority: "assertive",
          }
        )
      }
      return done
    },
    /** Moves one item to a point. */
    moveTo(
      key: string,
      point: MovePoint,
      details: { reason: MoveReason; event?: Event } = { reason: "imperative" }
    ) {
      const at = positions()[key] ?? { x: 0, y: 0 }
      return api.moveBy([key], point.x - at.x, point.y - at.y, details)
    },
    /** Alt with an arrow nudges the item's group. Returns whether it handled the key. */
    keydown(event: KeyboardEvent, key: string) {
      const direction = arrows[event.key]
      if (!direction || !event.altKey || options.disabled?.(key)) {
        return false
      }
      event.preventDefault()
      const step = options.step?.() ?? 1
      const by = event.shiftKey ? (options.largeStep?.() ?? step * 10) : step
      api.moveBy(group(key), direction[0] * by, direction[1] * by, {
        reason: "move-key",
        event,
      })
      return true
    },
    /** Starts a drag once the pointer moves past `dragThreshold`, so a click stays a click. Escape puts the items back. */
    pointerdown(event: PointerEvent, key: string, el: HTMLElement) {
      if (!drags.accepts(event) || options.disabled?.(key)) {
        return
      }
      // Offsets count from the press, so the item keeps up with the pointer past the threshold.
      const startX = event.clientX
      const startY = event.clientY
      drags.start(el, event, {
        threshold: dragThreshold,
        cancelOnEscape: true,
        onStart: () => setDraft({ keys: group(key), dx: 0, dy: 0 }),
        onMove: ({ x, y }) => {
          const draft = store.get()[options.draft] as MoveDraft | null
          const scale = options.scale?.() ?? 1
          if (draft) {
            setDraft({
              ...draft,
              dx: (x - startX) / scale,
              dy: (y - startY) / scale,
            })
          }
        },
        onEnd: (end, canceled) => {
          const draft = store.get()[options.draft] as MoveDraft | null
          setDraft(null)
          if (draft && !canceled && (draft.dx || draft.dy)) {
            api.moveBy(draft.keys, draft.dx, draft.dy, {
              reason: "drag",
              event: end,
            })
          }
        },
      })
    },
    /** Whether a pointer is dragging the item. */
    dragging(state: State, key: string) {
      return !!(state[options.draft] as MoveDraft | null)?.keys.includes(key)
    },
    /** The dragged item's offset, as a `style` attribute for a slot's `live`, or `undefined`. */
    style(state: State, key: string) {
      const draft = state[options.draft] as MoveDraft | null
      if (!draft?.keys.includes(key)) {
        return undefined
      }
      return `translate:${draft.dx}px ${draft.dy}px;--move-x:${draft.dx}px;--move-y:${draft.dy}px`
    },
  }
  return api
}

export {
  createMove,
  type MoveDraft,
  moveMessage,
  type MoveMessage,
  type MoveOptions,
  type MovePoint,
  type MoveReason,
}
