// Reordering a list or a grid: an item picked up with the keyboard or dragged
// with a pointer moves through a draft order in state, which renders as it
// moves, and only the drop commits it through the primitive's change. A group,
// like the selection, moves as one block. No WAI-ARIA pattern covers it, so
// the keys follow what sortable lists commonly use: Space or Enter picks an
// item up, arrows, Home and End move it, Space or Enter drops it, and Escape
// puts it back.
import { moveIndex, stepFor } from "../focus/collection"
import type { PrimitiveContext } from "../kernel/primitive-types"
import { announce } from "../platform/announce"
import { createAutoScroll, type AutoScrollOptions } from "./auto-scroll"
import { bindDragPreview, type DragPreview } from "./drag-preview"
import { createDraftMove } from "./draft-move"
import { isRTL } from "../platform/env"
import { createOrder } from "../kernel/order"
import { createDragSession, dragThreshold } from "./pointer"
import { labelOf } from "../text/typeahead"
import { isSameKeys } from "../selection/listbox-range"

/**
 * The item being moved and the order it's in now, kept in state under `ReorderOptions.draft`.
 * @stable
 */
type ReorderDraft = {
  /** The key of the item picked up. */
  key: string
  /** Every key moving together, in list order, the picked-up item included. */
  keys: string[]
  /** Every key in the order the list shows now, the moving items included. */
  order: string[]
  /** Whether a pointer is dragging it, rather than the keyboard moving it. */
  pointer: boolean
}

/**
 * What happened, for the message screen readers hear.
 * @stable
 */
type ReorderMessage = {
  /** `grab` when an item is picked up, `move` for each step, `drop` when it lands, `cancel` when it goes back. */
  type: "grab" | "move" | "drop" | "cancel"
  /** The item's key. */
  key: string
  /** What the item is called, from `label`, else its text. */
  label: string
  /** How many items move together. */
  count: number
  /** Its position now, from 1. */
  position: number
  /** How many items the list has. */
  total: number
}

/**
 * Why an order changed: a pointer drag, a keyboard move, or a call from code.
 * @stable
 */
type ReorderReason = "drag" | "move-key" | "imperative"

/**
 * How `createReorder` reads, renders and changes an order.
 * @stable
 */
type ReorderOptions<State extends object, Props = any> = {
  /** The slot whose parts are the items. Each joins in the slot's `bind` with `reorder.bind(el, part)`. */
  slot: string
  /** The state key that holds the order, a `string[]` of item keys. */
  key: keyof State & string
  /** The state key that holds the `ReorderDraft` while an item moves. Start it at `null`. */
  draft: keyof State & string
  /**
   * Asks for a new order and returns whether it went through. Pass the
   * primitive's change, so `on<Key>Change`, `cancel()` and controlled values
   * work: `set: (value, details) => change("value", value, details)`.
   */
  set: (
    value: string[],
    details: { reason: ReorderReason; event?: Event }
  ) => boolean
  /**
   * Whether the items run top to bottom, along a line, or wrap in rows like a
   * grid of photos, which picks the arrows and how a drag finds its place.
   * Defaults to `"vertical"`.
   */
  orientation?: () => ReorderOrientation
  /** The keys that move with the one picked up, like the selection when it holds it. Defaults to that one key. */
  group?: (key: string) => string[]
  /**
   * Drags a copy of the item above the page while the item itself shows
   * where it would drop, so a list that scrolls neither clips it nor grows
   * under it. A drag near a scroller's edge scrolls it. Defaults to `false`.
   */
  preview?: boolean
  /** How a drag with `preview` near a scroller's edge scrolls it, or `false` not to. */
  createAutoScroll?: Omit<AutoScrollOptions, "onScroll" | "ignore"> | false
  /** Whether an item can't be picked up. It still moves aside for others. */
  disabled?: (item: { key: string; props: Props }) => boolean
  /** The name screen readers hear for an item. Return `undefined` for the default, its text. */
  label?: (key: string) => string | undefined
  /** The text screen readers hear for each step. Defaults to English. */
  message?: (message: ReorderMessage) => string
}

/**
 * How the items of a reorderable list run.
 * @stable
 */
type ReorderOrientation = "horizontal" | "vertical" | "grid"

/**
 * The English messages `createReorder` announces unless you pass `message`.
 * @stable
 */
function reorderMessage({
  type,
  label: name,
  count,
  position,
  total,
}: ReorderMessage) {
  const at = `position ${position} of ${total}`
  const label = count > 1 ? `${count} items` : name
  if (type === "grab") {
    return `Picked up ${label}, ${at}.`
  }
  if (type === "move") {
    return `${label}, ${at}.`
  }
  if (type === "drop") {
    return `Dropped ${label} at ${at}.`
  }
  return `Moved ${label} back to ${at}.`
}

// The index among the other items a dragged item goes to: after every item
// whose middle the pointer has passed. Pure, so it's tested without layout.
function dropIndex(
  middles: readonly number[],
  pointer: number,
  { reversed = false }: { reversed?: boolean } = {}
) {
  let index = 0
  for (const middle of middles) {
    if (reversed ? middle > pointer : middle < pointer) {
      index++
    }
  }
  return index
}

// The index among the other items a dragged item goes to in a grid that wraps
// in rows: after every item on a row above the pointer, and every item on the
// pointer's row whose middle it has passed. Pure, so it's tested without layout.
function gridDropIndex(
  rects: readonly {
    left: number
    top: number
    right: number
    bottom: number
  }[],
  point: { x: number; y: number },
  { reversed = false }: { reversed?: boolean } = {}
) {
  let index = 0
  for (const rect of rects) {
    const middle = (rect.left + rect.right) / 2
    const passed = reversed ? point.x < middle : point.x > middle
    if (point.y > rect.bottom || (point.y >= rect.top && passed)) {
      index++
    }
  }
  return index
}

// How many items the first row of a grid holds, from their tops.
function columnsOf(tops: readonly number[]) {
  let count = 0
  while (count < tops.length && Math.abs(tops[count] - tops[0]) < 1) {
    count++
  }
  return Math.max(1, count)
}

// The order with `key`, or every key in `key`, moved to `index` among the
// rest, as one block in list order. The same array when it's already there.
function movedTo(
  order: readonly string[],
  key: string | readonly string[],
  index: number
) {
  const keys =
    typeof key === "string" ? [key] : order.filter((item) => key.includes(item))
  const rest = order.filter((item) => !keys.includes(item))
  const to = Math.max(0, Math.min(rest.length, index))
  if (keys.every((item, i) => order[to + i] === item)) {
    return order as string[]
  }
  rest.splice(to, 0, ...keys)
  return rest
}

// The order with `keys` gathered into one block where `key` is.
function gathered(
  order: readonly string[],
  key: string,
  keys: readonly string[]
) {
  const before = order
    .slice(0, order.indexOf(key))
    .filter((k) => !keys.includes(k)).length
  return keys.length > 1 ? movedTo(order, keys, before) : [...order]
}

/**
 * Lets users reorder a slot's parts by dragging them and with the keyboard.
 * The moving item and its order live in state under `draft`, so the list
 * renders the order as it changes; only dropping commits it through `set`,
 * and screen readers hear each step through `announce`. Call it once in
 * `api`, keep it on the api, render the items in `reorder.order(state)`,
 * and wire the item slot:
 *
 * ```ts
 * item: slot<{ value: string }>({
 *   on: {
 *     keydown: (event, { el, api, key }) => api.reorder.keydown(event, key) || api.roving.keydown(event, el!),
 *     pointerdown: (event, { api, key }) => api.reorder.pointerdown(event, key),
 *   },
 *   bind: (el, part) => part.api.reorder.bind(el, part),
 * })
 * ```
 *
 * While a pointer drags an item, its element gets `--drag-x` and `--drag-y`,
 * how far to translate it so it stays under the pointer as the list reorders
 * around it. Wire `pointerdown` on a handle part instead, with the item's
 * key, to drag by a handle.
 * @stable
 */
function createReorder<State extends object, Props = any>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: ReorderOptions<State, Props>
) {
  const { store } = context
  const items = createOrder<{ key: string; el: HTMLElement; props: Props }>()
  const orientation = () => options.orientation?.() ?? "vertical"
  const element = (key: string) =>
    items.list().find((item) => item.key === key)?.el
  const { draft, value, setDraft, focusLater, drop, cancel } = createDraftMove({
    store,
    draft: options.draft,
    value: options.key,
    shown: (current: ReorderDraft) => current.order,
    same: isSameKeys,
    rebase(current, now, moved) {
      if (!now.includes(current.key)) {
        return null
      }
      const keys = now.filter((key) => current.keys.includes(key))
      const order = gathered(now, current.key, keys)
      if (!moved) {
        return { ...current, keys, order }
      }
      const at = current.order.indexOf(current.keys[0])
      const index = current.order
        .slice(0, at)
        .filter((key) => now.includes(key)).length
      return { ...current, keys, order: movedTo(order, keys, index) }
    },
    commit: (current, details) => options.set(current.order, details),
    say: (type, current, order) =>
      say(type, current.key, order, current.keys.length),
    element,
  })

  function say(
    type: ReorderMessage["type"],
    key: string,
    order: readonly string[],
    count = 1
  ) {
    const el = element(key)
    const label = options.label?.(key) ?? (el ? labelOf(el) : key)
    const message = {
      type,
      key,
      label,
      count,
      position: order.indexOf(key) + 1,
      total: order.length,
    }
    announce((options.message ?? reorderMessage)(message), {
      priority: "assertive",
    })
  }

  const isDisabled = (key: string) => {
    const item = items.list().find((entry) => entry.key === key)
    return !!item && !!options.disabled?.(item)
  }

  // Picks up an item and its group, gathered into one block where the item is.
  function grab(key: string, pointer: boolean) {
    const current = value()
    if (draft() || !current.includes(key) || isDisabled(key)) {
      return false
    }
    const group = new Set(options.group?.(key) ?? [])
    const keys = current.filter(
      (k) => k === key || (group.has(k) && !isDisabled(k))
    )
    const order = gathered(current, key, keys)
    setDraft({ key, keys, order, pointer })
    say("grab", key, order, keys.length)
    if (!pointer && keys.length > 1) {
      focusLater(key)
    }
    return true
  }

  function moveTo(index: number) {
    const current = draft()
    if (!current) {
      return
    }
    const order = movedTo(current.order, current.keys, index)
    if (order === current.order) {
      return
    }
    setDraft({ ...current, order })
    say("move", current.key, order, current.keys.length)
    if (!current.pointer) {
      focusLater(current.key)
    }
  }

  // How far a key moves the picked-up block: along the line, or in a grid,
  // Left and Right by one and Up and Down by a row.
  function stepOf(key: string, rtl: boolean) {
    const kind = orientation()
    if (kind !== "grid") {
      return stepFor(key, kind, rtl)
    }
    if (key !== "ArrowUp" && key !== "ArrowDown") {
      return stepFor(key, "horizontal", rtl)
    }
    const columns = columnsOf(
      items.list().map(({ el }) => el.getBoundingClientRect().top)
    )
    return key === "ArrowUp" ? -columns : columns
  }

  // Where the moving block goes for a pointer at a point, among the other items.
  function indexAt(x: number, y: number) {
    const moving = draft()?.keys ?? []
    const others = items.list().filter((item) => !moving.includes(item.key))
    const rects = others.map(({ el }) => el.getBoundingClientRect())
    const kind = orientation()
    const reversed = kind !== "vertical" && !!others[0] && isRTL(others[0].el)
    if (kind === "grid") {
      return gridDropIndex(rects, { x, y }, { reversed })
    }
    const vertical = kind === "vertical"
    const middles = rects.map((rect) =>
      vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2
    )
    return dropIndex(middles, vertical ? y : x, { reversed })
  }

  // The pointer drag in progress, which the instance ends if it's destroyed mid-drag.
  const drags = createDragSession(context.onDestroy)

  // Puts a dragged item where the pointer is, and keeps its element under the
  // pointer while the list moves it. Layout offsets ignore transforms, so the
  // translate doesn't count itself, whether or not the styles apply it.
  function follow(
    key: string,
    start: { x: number; y: number; left: number; top: number }
  ) {
    let x = start.x
    let y = start.y
    const place = () => {
      const el = element(key)
      if (!el) {
        return
      }
      el.style.setProperty(
        "--drag-x",
        `${x - start.x - (el.offsetLeft - start.left)}px`
      )
      el.style.setProperty(
        "--drag-y",
        `${y - start.y - (el.offsetTop - start.top)}px`
      )
    }
    const track = (pointerX: number, pointerY: number) => {
      x = pointerX
      y = pointerY
      reorder.moveTo(indexAt(x, y))
      place()
    }
    // The list renders the new order after the move, so the element is placed again once it has.
    const view = element(key)?.ownerDocument.defaultView
    let frame = 0
    const unsubscribe = store.subscribe(() => {
      if (view && !frame) {
        frame = view.requestAnimationFrame(() => ((frame = 0), place()))
      }
    })
    const stop = () => {
      unsubscribe()
      if (frame) {
        view?.cancelAnimationFrame(frame)
      }
      const el = element(key)
      el?.style.removeProperty("--drag-x")
      el?.style.removeProperty("--drag-y")
    }
    return { track, stop }
  }

  // Drags a copy of the item above the page, while the item itself stays
  // where it would drop and a drag near a scroller's edge scrolls it.
  function float(
    key: string,
    el: HTMLElement,
    start: { x: number; y: number }
  ) {
    let x = start.x
    let y = start.y
    const preview: DragPreview = bindDragPreview(el, start)
    // The copy is the item in flight, not the place it would drop.
    preview.el.removeAttribute("data-moving")
    preview.el.removeAttribute("data-dragging")
    const count = draft()?.keys.length ?? 1
    if (count > 1) {
      preview.el.setAttribute("data-drag-count", String(count))
      preview.el.style.setProperty("--drag-count", String(count))
    }
    const scroller =
      options.createAutoScroll === false
        ? undefined
        : createAutoScroll({
            ...options.createAutoScroll,
            ignore: () => element(key),
            onScroll: () => reorder.moveTo(indexAt(x, y)),
          })
    const track = (pointerX: number, pointerY: number) => {
      x = pointerX
      y = pointerY
      preview.move(x, y)
      scroller?.update(x, y)
      reorder.moveTo(indexAt(x, y))
    }
    const stop = () => {
      scroller?.stop()
      preview.remove()
    }
    return { track, stop }
  }

  function pointerdown(event: PointerEvent, key: string) {
    const el = element(key)
    if (!el || !drags.accepts(event) || draft()) {
      return
    }
    const start = {
      x: event.clientX,
      y: event.clientY,
      left: el.offsetLeft,
      top: el.offsetTop,
    }
    let drag:
      { track: (x: number, y: number) => void; stop: () => void } | undefined
    // The drop reports the move that placed the item: a pointerup's zero
    // pressure reads as a screen reader's pointer to `details.source`.
    let lastMove: PointerEvent | undefined
    drags.start(el, event, {
      threshold: dragThreshold,
      cancelOnEscape: true,
      onStart: () => {
        if (!grab(key, true)) {
          return false
        }
        drag = options.preview ? float(key, el, start) : follow(key, start)
      },
      onMove: ({ x, y, event: moveEvent }) => {
        moveEvent.preventDefault()
        lastMove = moveEvent
        drag?.track(x, y)
      },
      onEnd: (endEvent, canceled) => {
        if (!drag) {
          return
        }
        drag.stop()
        drag = undefined
        if (canceled) {
          cancel()
        } else {
          drop("drag", lastMove ?? endEvent)
        }
      },
    })
  }

  const reorder = {
    /** Joins a bound part to the list. Call it from the item slot's `bind` and return its cleanup. */
    bind(el: HTMLElement, part: { key: string; props: Props }) {
      return items.add({ key: part.key, el, props: part.props })
    },
    /** The order to render: the draft's while an item moves, else the value. Pure, so `state` and `attrs` can call it. */
    order(state: State) {
      return (
        (state[options.draft] as ReorderDraft | null)?.order ??
        (state[options.key] as string[])
      )
    },
    /** Whether an item is picked up, by itself or with its group. */
    moving(state: State, key: string) {
      return !!(state[options.draft] as ReorderDraft | null)?.keys.includes(key)
    },
    /** Whether a pointer is dragging the item, by itself or with its group. */
    dragging(state: State, key: string) {
      const current = state[options.draft] as ReorderDraft | null
      return !!current?.pointer && current.keys.includes(key)
    },
    /**
     * Handles a key pressed on an item and returns whether it did. Space or
     * Enter picks the item up; while it's up, arrows, Home and End move it,
     * Space or Enter drops it, Escape puts it back and Tab puts it back and
     * moves on. Every other key is swallowed while an item is up, so pass
     * keys on only when this returns `false`.
     */
    keydown(event: KeyboardEvent, key: string) {
      const current = draft()
      if (event.defaultPrevented || current?.pointer) {
        return !!current
      }
      const modified = event.altKey || event.ctrlKey || event.metaKey
      if (!current) {
        if (
          modified ||
          (event.key !== " " && event.key !== "Enter") ||
          !grab(key, false)
        ) {
          return false
        }
        event.preventDefault()
        return true
      }
      if (event.key === "Tab") {
        cancel(false)
        return true
      }
      const target =
        event.target instanceof HTMLElement ? event.target : undefined
      const step = modified
        ? undefined
        : stepOf(event.key, !!target && isRTL(target))
      if (step !== undefined) {
        event.preventDefault()
        // The block's place among the other items, and how many places there are.
        const index = current.order.indexOf(current.keys[0])
        const count = current.order.length - current.keys.length + 1
        // A row up or down from the first or last row stays put.
        const off =
          typeof step === "number" &&
          Math.abs(step) > 1 &&
          (index + step < 0 || index + step >= count)
        if (!off) {
          moveTo(moveIndex(index, step, count, false))
        }
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault()
        drop("move-key", event)
      } else if (event.key === "Escape") {
        event.preventDefault()
        // A popup around the list would close on the same press.
        event.stopPropagation()
        cancel()
      }
      return true
    },
    /** Starts a pointer drag of an item once the pointer moves a few pixels, so a click stays a click. */
    pointerdown,
    /** Picks an item up, as Space does. Returns whether it did. */
    grab: (key: string) => grab(key, false),
    /** Moves the picked-up item to `index` in the draft, counting from 0. */
    moveTo,
    /** Drops the picked-up item where it is, committing the draft. */
    drop: (event?: Event) => drop("move-key", event),
    /** Puts the picked-up item back where it was. */
    cancel: () => cancel(),
    /** Moves an item to `index` at once, like a "Move to top" menu item. Returns whether it went through. */
    move(key: string, index: number) {
      const order = value()
      if (!order.includes(key)) {
        return false
      }
      const next = movedTo(order, key, index)
      if (next === order) {
        return false
      }
      if (!options.set(next, { reason: "imperative" })) {
        return false
      }
      say("drop", key, next)
      return true
    },
  }
  return reorder
}

/**
 * What `createReorder` returns.
 * @stable
 */
type Reorder = ReturnType<typeof createReorder>

export {
  columnsOf,
  createReorder,
  dropIndex,
  gridDropIndex,
  movedTo,
  type Reorder,
  type ReorderDraft,
  reorderMessage,
  type ReorderMessage,
  type ReorderOptions,
  type ReorderOrientation,
  type ReorderReason,
}
