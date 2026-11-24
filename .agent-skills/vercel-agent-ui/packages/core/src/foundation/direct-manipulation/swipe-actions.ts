// Actions behind a list's rows, as mail apps have: swiping a row aside shows
// the buttons under it, a release past half of them leaves it open, a swipe
// that keeps going, or a flick, opens or closes it the way it went, and a
// long swipe runs the first action at once, like archiving a message. The row's offset is a live
// draft written as a custom property, so a drag renders nothing. From the
// keyboard, Left and Right open a row's actions and move into them, and
// Escape closes them, so nothing needs a pointer.
import type { PrimitiveContext } from "../kernel/primitive-types"
import { isRTL } from "../platform/env"
import { on } from "../kernel/events"
import { createDragSession } from "../drag-and-drop/pointer"
import { rubberBand } from "../motion/rubber-band"
import { createVelocityTracker } from "../motion/velocity"

// How far a press moves before it's a swipe, and how fast a release, in px per ms, is a flick.
const slop = 8
const flick = 0.3

/**
 * The side of a row its actions sit on: `start` shows by swiping toward the end, left to right in English.
 * @experimental
 */
type SwipeSide = "start" | "end"

/**
 * The row whose actions show, and on which side.
 * @experimental
 */
type SwipeOpen = { key: string; side: SwipeSide }

/**
 * A row a pointer is swiping, kept in state under `SwipeActionsOptions.draft`.
 * @experimental
 */
type SwipeDraft = {
  key: string
  /** How far the row has moved, in pixels, positive to the right. */
  x: number
  /** Whether letting go now runs the first action. */
  full: boolean
}

/**
 * How `createSwipeActions` keeps its rows.
 * @experimental
 */
type SwipeActionsOptions<State extends object> = {
  /** The state key that holds the `SwipeOpen` row, or `null`. */
  key: keyof State & string
  /** The state key that holds the `SwipeDraft` while a pointer swipes. Start it at `null`, and list it in `live`. */
  draft: keyof State & string
  /**
   * Runs a side's first action when a swipe goes past `fullSwipe` of the
   * row's width, and returns whether it did. Without it, a long swipe only
   * opens the row.
   */
  onFullSwipe?: (
    key: string,
    side: SwipeSide,
    details: { event: Event }
  ) => boolean
  /** How far across the row a swipe runs the first action, as a fraction of its width. @defaultValue 0.6 */
  fullSwipe?: () => number
  /** Whether a row can't be swiped. */
  disabled?: (key: string) => boolean
}

/**
 * Lets users swipe a list's rows aside to their actions. Call it once in
 * `api`, keep it on the api, and wire a row, its moving content, and the
 * actions on each side under it:
 *
 * ```ts
 * row: slot<{ value: string }>({
 *   on: {
 *     pointerdown: (event, { el, api, key }) => api.swipe.pointerdown(event, key, el!),
 *     keydown: (event, { api, key }) => api.swipe.keydown(event, key),
 *   },
 *   bind: (el, { api, key }) => api.swipe.bindRow(el, key),
 * }),
 * content: slot<{ value: string }>({
 *   attrs: () => ({ style: "transform: translateX(var(--swipe-x, 0px))" }),
 *   live: live((state, { api, key }) => api.swipe.contentAttrs(state, key)),
 * }),
 * actions: slot<{ id: string; row: string; side: SwipeSide }>({
 *   attrs: (state, { api, props }) => api.swipe.actionsAttrs(state, props.row, props.side),
 *   bind: (el, { api, props }) => api.swipe.bindActions(el, props.row, props.side),
 * }),
 * ```
 * @experimental
 */
function createSwipeActions<State extends object>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: SwipeActionsOptions<State>
) {
  const { store } = context
  const rows = new Map<string, HTMLElement>()
  const actions = new Map<string, HTMLElement>()
  const actionsId = (key: string, side: SwipeSide) => `${side}:${key}`
  const drags = createDragSession(context.onDestroy)
  let offOutside: (() => void) | undefined
  context.onDestroy(() => offOutside?.())

  const open = () => store.get()[options.key] as SwipeOpen | null
  const rtl = (key: string) => {
    const el = rows.get(key)
    return !!el && isRTL(el)
  }
  // Which way a side's actions push the row: `start` to the right in left-to-right text.
  const sign = (key: string, side: SwipeSide) =>
    (side === "start") !== rtl(key) ? 1 : -1
  const sideOf = (key: string, x: number) =>
    x > 0 !== rtl(key) ? ("start" as const) : ("end" as const)
  const width = (key: string, side: SwipeSide) =>
    actions.get(actionsId(key, side))?.getBoundingClientRect().width ?? 0
  const buttons = (key: string, side: SwipeSide) => [
    ...(actions
      .get(actionsId(key, side))
      ?.querySelectorAll<HTMLElement>("button, [href], [tabindex]") ?? []),
  ]

  function setOpen(next: SwipeOpen | null) {
    store.set({ [options.key]: next, [options.draft]: null } as Partial<State>)
    offOutside?.()
    offOutside = undefined
    if (!next) {
      return
    }
    // A press anywhere but the open row closes it, unless it's a second finger while one swipes.
    const doc = rows.get(next.key)?.ownerDocument
    if (doc) {
      offOutside = on(
        doc,
        "pointerdown",
        (event) => {
          if (
            event.isPrimary &&
            !rows.get(next.key)?.contains(event.target as Node)
          ) {
            api.close()
          }
        },
        { capture: true }
      )
    }
  }

  const api = {
    /** The row whose actions show, if any. */
    open,
    /** How far a row has moved, in pixels, positive to the right: the swipe's, or the open side's width. */
    offset(state: State, key: string) {
      const swiping = state[options.draft] as SwipeDraft | null
      if (swiping?.key === key) {
        return swiping.x
      }
      const shown = state[options.key] as SwipeOpen | null
      return shown?.key === key
        ? sign(key, shown.side) * width(key, shown.side)
        : 0
    },
    /**
     * Live attributes for the row's moving content: `--swipe-x`, its offset;
     * `data-swipe`, the side it shows, to show only that side's actions;
     * `data-swiping` while a pointer moves it, to turn off a transition; and
     * `data-full` while letting go would run the first action.
     */
    contentAttrs(state: State, key: string) {
      const swiping = state[options.draft] as SwipeDraft | null
      const mine = swiping?.key === key
      const x = api.offset(state, key)
      return {
        style: `--swipe-x:${x}px`,
        "data-swipe": x ? sideOf(key, x) : undefined,
        "data-swiping": mine ? "" : undefined,
        "data-full": mine && swiping.full ? "" : undefined,
      }
    },
    /** The actions on a side: `data-side`, and `inert` unless the row is open on that side, so Tab skips hidden buttons. */
    actionsAttrs(state: State, key: string, side: SwipeSide) {
      const shown = state[options.key] as SwipeOpen | null
      const visible = shown?.key === key && shown.side === side
      return { "data-side": side, inert: visible ? undefined : "" }
    },
    /** Joins a row, for its direction and to close it on a press elsewhere. Return its cleanup from `bind`. */
    bindRow(el: HTMLElement, key: string) {
      rows.set(key, el)
      return () => {
        if (rows.get(key) === el) {
          rows.delete(key)
        }
      }
    },
    /** Joins the actions on one side of a row, which a swipe measures to know how far it opens. */
    bindActions(el: HTMLElement, key: string, side: SwipeSide) {
      const id = actionsId(key, side)
      actions.set(id, el)
      return () => {
        if (actions.get(id) === el) {
          actions.delete(id)
        }
      }
    },
    /** Opens a row's actions on a side, closing any other row's. With `focus`, its first action takes focus. */
    show(key: string, side: SwipeSide, { focus = false } = {}) {
      if (!width(key, side) || options.disabled?.(key)) {
        return false
      }
      setOpen({ key, side })
      if (focus) {
        const el = actions.get(actionsId(key, side))
        // The attribute goes once the adapter renders; focus can't wait for it.
        if (el) {
          el.inert = false
        }
        buttons(key, side)[0]?.focus()
      }
      return true
    },
    /** Closes the open row. With `focus`, the row takes focus back, as after Escape. */
    close({ focus = false } = {}) {
      const shown = open()
      if (!shown) {
        return false
      }
      if (focus) {
        rows.get(shown.key)?.focus()
      }
      setOpen(null)
      return true
    },
    /**
     * Follows a press on a row that may become a swipe across it. The press
     * stays a press until the pointer moves a few pixels across, so clicks
     * and vertical scrolls keep working.
     */
    pointerdown(event: PointerEvent, key: string, el: HTMLElement) {
      if (!drags.accepts(event) || options.disabled?.(key)) {
        return
      }
      const shown = open()
      // A press inside the open actions is a click on one.
      if (
        shown?.key === key &&
        actions.get(actionsId(key, shown.side))?.contains(event.target as Node)
      ) {
        return
      }
      const from =
        shown?.key === key ? sign(key, shown.side) * width(key, shown.side) : 0
      if (!from && !width(key, "start") && !width(key, "end")) {
        return
      }
      const rowWidth = el.getBoundingClientRect().width || 1
      const fraction = options.fullSwipe?.() ?? 0.6
      const velocity = createVelocityTracker()
      velocity.add(event.timeStamp, event.clientX)
      let last = { x: from, side: sideOf(key, from), full: false }

      const place = (dx: number) => {
        const raw = from + dx
        const side = sideOf(key, raw)
        const room = width(key, side)
        const full = !!options.onFullSwipe && room > 0
        // Past its actions a row moves on toward a full swipe, or resists without one.
        const limit = full ? rowWidth : room
        const past = Math.abs(raw) - limit
        const x =
          past > 0 ? Math.sign(raw) * (limit + rubberBand(past, rowWidth)) : raw
        last = { x, side, full: full && Math.abs(raw) >= rowWidth * fraction }
        store.set({ [options.draft]: { key, ...last } } as Partial<State>)
      }
      const finish = (end: PointerEvent, canceled: boolean) => {
        if (options.disabled?.(key)) {
          return setOpen(null)
        }
        const { x, side, full } = last
        if (
          !canceled &&
          full &&
          options.onFullSwipe?.(key, side, { event: end })
        ) {
          return setOpen(null)
        }
        const room = width(key, side)
        // A flick decides whichever way it went; otherwise past half the actions stays open.
        const speed = canceled ? 0 : velocity.velocity(end.timeStamp)
        const opening =
          Math.abs(speed) >= flick
            ? Math.sign(speed) === Math.sign(x)
            : Math.abs(x) >= room / 2
        setOpen(opening && room && x ? { key, side } : null)
      }

      drags.startOnMove(el, event, {
        pick(move) {
          const dx = move.clientX - event.clientX
          const dy = move.clientY - event.clientY
          if (Math.hypot(dx, dy) < slop) {
            return undefined
          }
          // A press that moves up or down first is a scroll, not a swipe.
          if (Math.abs(dy) >= Math.abs(dx)) {
            return false
          }
          velocity.add(move.timeStamp, move.clientX)
          place(dx)
          return true
        },
        onMove: ({ x, event: next }) => {
          velocity.add(next.timeStamp, x)
          place(x - event.clientX)
        },
        onEnd: finish,
        // A tap on an open row closes it, as a tap on its content would on a phone.
        onTap: () => from && api.close(),
      })
    },
    /**
     * Handles a key on a row or its actions and returns whether it did. Left
     * and Right open the actions on the side the row would swipe toward and
     * focus the first, then move between them; toward the row's content from
     * the last one, or Escape, closes them and puts focus back on the row.
     */
    keydown(event: KeyboardEvent, key: string) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return false
      }
      const shown = open()?.key === key ? open() : null
      if (event.key === "Escape" && shown) {
        event.preventDefault()
        return api.close({ focus: true })
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return false
      }
      // Which way on screen: Left would swipe the row left, showing the actions on its right.
      const dx = event.key === "ArrowRight" ? 1 : -1
      if (!shown) {
        if (!api.show(key, sideOf(key, dx), { focus: true })) {
          return false
        }
        event.preventDefault()
        return true
      }
      event.preventDefault()
      const list = buttons(key, shown.side)
      const index = list.indexOf(event.target as HTMLElement)
      const next = index === -1 ? 0 : index + (rtl(key) ? -dx : dx)
      if (
        index === -1
          ? dx === sign(key, shown.side)
          : next < 0 || next >= list.length
      ) {
        // The row's content lies the way it moved, so heading there closes the actions.
        if (dx === sign(key, shown.side)) {
          api.close({ focus: true })
        }
        return true
      }
      list[next].focus()
      return true
    },
  }
  return api
}

/**
 * What `createSwipeActions` returns.
 * @experimental
 */
type SwipeActions = ReturnType<typeof createSwipeActions>

export {
  createSwipeActions,
  type SwipeActions,
  type SwipeActionsOptions,
  type SwipeDraft,
  type SwipeOpen,
  type SwipeSide,
}
