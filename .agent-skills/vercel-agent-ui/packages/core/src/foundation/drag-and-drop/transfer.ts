// Moving items between lists: cards across a kanban board's columns, files
// between folders, people between teams. It's reordering across containers,
// with the same rules as `createReorder`: the moving item and every list's
// order live in a draft that renders as it changes, only the drop commits,
// and screen readers hear each step. Arrows up and down move within a list,
// left and right to the next list.
import type { PrimitiveContext } from "../kernel/primitive-types"
import { announce } from "../platform/announce"
import { createAutoScroll, type AutoScrollOptions } from "./auto-scroll"
import { bindDragPreview, type DragPreview } from "./drag-preview"
import { createDraftMove } from "./draft-move"
import { isRTL } from "../platform/env"
import { createDragSession, dragThreshold } from "./pointer"
import { labelOf } from "../text/typeahead"
import { dropIndex } from "./reorder"

/**
 * Every list's item keys, in order, by the list's key.
 * @experimental
 */
type TransferLists = Record<string, string[]>

/**
 * The item being moved and where every item is now, kept in state under `TransferOptions.draft`.
 * @experimental
 */
type TransferDraft = {
  /** The key of the item being moved. */
  key: string
  /** The list it started in. */
  from: string
  /** Every list as it shows now, the moving item included. */
  lists: TransferLists
  /** Whether a pointer is dragging it, rather than the keyboard moving it. */
  pointer: boolean
}

/**
 * Why the lists changed: a pointer drag, a keyboard move, or a call from code.
 * @experimental
 */
type TransferReason = "drag" | "move-key" | "imperative"

/**
 * What happened, for the message screen readers hear.
 * @experimental
 */
type TransferMessage = {
  /** `grab` when an item is picked up, `move` for each step, `drop` when it lands, `cancel` when it goes back. */
  type: "grab" | "move" | "drop" | "cancel"
  /** The item's key. */
  key: string
  /** What the item is called, from `label`, else its text. */
  label: string
  /** What the list it's in is called, from `listLabel`, else its key. */
  list: string
  /** Its position in that list, from 1. */
  position: number
  /** How many items that list has. */
  total: number
}

/**
 * How `createTransfer` reads, renders and changes the lists.
 * @experimental
 */
type TransferOptions<State extends object> = {
  /** The state key that holds every list, a `TransferLists`. */
  key: keyof State & string
  /** The state key that holds the `TransferDraft` while an item moves. Start it at `null`. */
  draft: keyof State & string
  /**
   * Asks for the new lists and returns whether they went through. Pass the
   * primitive's change: `set: (value, details) => change("lists", value, details)`.
   * `details` says what moved, from where to where.
   */
  set: (
    value: TransferLists,
    details: {
      reason: TransferReason
      event?: Event
      key: string
      from: string
      to: string
      index: number
    }
  ) => boolean
  /** The lists in the order Left and Right go through them. Defaults to the order of the value's keys. */
  order?: () => string[]
  /** Whether a list takes an item, like a column at its limit. Lists that don't are skipped. */
  accepts?: (key: string, list: string) => boolean
  /** Whether an item can't be picked up. */
  disabled?: (key: string) => boolean
  /** The name screen readers hear for an item. Defaults to its text. */
  label?: (key: string) => string | undefined
  /** The name screen readers hear for a list. Defaults to its key. */
  listLabel?: (list: string) => string | undefined
  /** The text screen readers hear for each step. Defaults to English. */
  message?: (message: TransferMessage) => string
  /** How a drag near a scroller's edge scrolls it, or `false` not to. */
  createAutoScroll?: Omit<AutoScrollOptions, "onScroll" | "ignore"> | false
}

/**
 * The English messages `createTransfer` announces unless you pass `message`.
 * @experimental
 */
function transferMessage({
  type,
  label,
  list,
  position,
  total,
}: TransferMessage) {
  const at = `${list}, position ${position} of ${total}`
  if (type === "grab") {
    return `Picked up ${label}, ${at}.`
  }
  if (type === "move") {
    return `${label}, ${at}.`
  }
  if (type === "drop") {
    return `Dropped ${label} in ${at}.`
  }
  return `Moved ${label} back to ${at}.`
}

// The lists with `key` taken out and put in `list` at `index`.
function transferred(
  lists: TransferLists,
  key: string,
  list: string,
  index: number
) {
  const next: TransferLists = {}
  for (const [name, keys] of Object.entries(lists)) {
    next[name] = keys.filter((k) => k !== key)
  }
  const target = [...(next[list] ?? [])]
  target.splice(Math.max(0, Math.min(target.length, index)), 0, key)
  next[list] = target
  return next
}

const listWith = (lists: TransferLists, key: string) =>
  Object.keys(lists).find((list) => lists[list].includes(key))

const sameLists = (a: TransferLists, b: TransferLists) => {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (list) =>
        a[list].length === b[list]?.length &&
        a[list].every((key, i) => b[list][i] === key)
    )
  )
}

/**
 * Lets users move a slot's parts between lists, by dragging them and with
 * the keyboard. Call it once in `api`, keep it on the api, render each
 * list's items from `lists(state)`, and wire both slots:
 *
 * ```ts
 * column: slot<{ value: string }>({ bind: (el, { api, key }) => api.transfer.bindList(el, key) }),
 * card: slot<{ value: string }>({
 *   on: {
 *     keydown: (event, { el, api, key }) => api.transfer.keydown(event, key) || api.roving.keydown(event, el!),
 *     pointerdown: (event, { api, key }) => api.transfer.pointerdown(event, key),
 *   },
 *   bind: (el, { api, key }) => api.transfer.bindItem(el, key),
 * })
 * ```
 *
 * While a pointer drags, a copy of the item with `data-drag-preview` follows
 * it above the page, the item itself shows where it would drop with
 * `data-dragging`, and a drag near a scroller's edge scrolls it.
 * @experimental
 */
function createTransfer<State extends object>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: TransferOptions<State>
) {
  const { store } = context
  const items = new Map<string, HTMLElement>()
  const lists = new Map<string, HTMLElement>()
  const { draft, value, setDraft, focusLater, drop, cancel } = createDraftMove({
    store,
    draft: options.draft,
    value: options.key,
    shown: (current: TransferDraft) => current.lists,
    same: sameLists,
    rebase(current, now, moved) {
      const from = listWith(now, current.key)
      if (from === undefined) {
        return null
      }
      if (!moved) {
        return { ...current, from, lists: now }
      }
      const list = listWith(current.lists, current.key)!
      if (
        !now[list] ||
        (list !== from &&
          options.accepts &&
          !options.accepts(current.key, list))
      ) {
        return null
      }
      const keys = current.lists[list]
      const index = keys
        .slice(0, keys.indexOf(current.key))
        .filter((key) => now[list].includes(key)).length
      return {
        ...current,
        from,
        lists: transferred(now, current.key, list, index),
      }
    },
    commit(current, details) {
      const to = listWith(current.lists, current.key) ?? current.from
      const index = current.lists[to]?.indexOf(current.key) ?? 0
      return options.set(current.lists, {
        ...details,
        key: current.key,
        from: current.from,
        to,
        index,
      })
    },
    say: (type, current, lists) => say(type, current.key, lists),
    element: (key) => items.get(key),
  })
  const order = () => options.order?.() ?? Object.keys(value())

  function say(
    type: TransferMessage["type"],
    key: string,
    current: TransferLists
  ) {
    const el = items.get(key)
    const list = listWith(current, key) ?? ""
    const message = {
      type,
      key,
      label: options.label?.(key) ?? (el ? labelOf(el) : key),
      list: options.listLabel?.(list) ?? list,
      position: (current[list]?.indexOf(key) ?? 0) + 1,
      total: current[list]?.length ?? 0,
    }
    announce((options.message ?? transferMessage)(message), {
      priority: "assertive",
    })
  }

  function grab(key: string, pointer: boolean) {
    const from = listWith(value(), key)
    if (draft() || from === undefined || options.disabled?.(key)) {
      return false
    }
    setDraft({ key, from, lists: value(), pointer })
    say("grab", key, value())
    return true
  }

  function moveTo(list: string, index: number) {
    const current = draft()
    if (!current) {
      return false
    }
    const changesList = list !== listWith(current.lists, current.key)
    if (changesList && options.accepts && !options.accepts(current.key, list)) {
      return false
    }
    const next = transferred(current.lists, current.key, list, index)
    if (sameLists(next, current.lists)) {
      return false
    }
    setDraft({ ...current, lists: next })
    say("move", current.key, next)
    if (!current.pointer) {
      focusLater(current.key)
    }
    return true
  }

  // The list under a point: the one containing it, else the nearest across.
  function listAt(x: number, y: number) {
    let best: { list: string; distance: number } | undefined
    for (const [list, el] of lists) {
      if (!el.isConnected) {
        continue
      }
      const rect = el.getBoundingClientRect()
      const dx =
        x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
      const dy =
        y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
      const distance = Math.hypot(dx, dy)
      if (!best || distance < best.distance) {
        best = { list, distance }
      }
    }
    return best?.list
  }

  const drags = createDragSession(context.onDestroy)

  function pointerdown(event: PointerEvent, key: string) {
    const start = items.get(key)
    if (!start || !drags.accepts(event) || draft()) {
      return
    }
    let pointer = { x: event.clientX, y: event.clientY }
    let dragging = false
    // Whether the item had focus, which the new element in another list takes over.
    let focused = false
    let lastMove: PointerEvent | undefined
    let preview: DragPreview | undefined
    const track = () => {
      const current = draft()
      const list = listAt(pointer.x, pointer.y)
      if (!current || list === undefined) {
        return
      }
      const others = (current.lists[list] ?? []).filter((k) => k !== key)
      const middles = others.map((k) => {
        const rect = items.get(k)?.getBoundingClientRect()
        return rect ? rect.top + rect.height / 2 : 0
      })
      moveTo(list, dropIndex(middles, pointer.y))
    }
    const scroller =
      options.createAutoScroll === false
        ? undefined
        : createAutoScroll({
            ...options.createAutoScroll,
            ignore: () => items.get(key),
            onScroll: track,
          })
    drags.start(start, event, {
      threshold: dragThreshold,
      cancelOnEscape: true,
      onStart: () => {
        if (!grab(key, true)) {
          return false
        }
        preview = bindDragPreview(start, { x: event.clientX, y: event.clientY })
        // The copy is the item in flight, not the place it would drop.
        preview.el.removeAttribute("data-moving")
        preview.el.removeAttribute("data-dragging")
        dragging = true
        focused = start.contains(start.ownerDocument.activeElement)
      },
      onMove: ({ x, y, event: moveEvent }) => {
        moveEvent.preventDefault()
        lastMove = moveEvent
        pointer = { x, y }
        preview?.move(x, y)
        scroller?.update(x, y)
        track()
      },
      onEnd: (endEvent, canceled) => {
        const dragged = dragging
        scroller?.stop()
        preview?.remove()
        preview = undefined
        dragging = false
        if (!dragged) {
          return
        }
        if (canceled) {
          cancel()
        } else {
          drop("drag", lastMove ?? endEvent)
        }
        // The item renders as a new element in its new list; focus follows it there.
        if (focused) {
          focusLater(key)
        }
      },
    })
  }

  const transfer = {
    /** Joins a list's element, so drags find it. Return its cleanup from the list slot's `bind`. */
    bindList(el: HTMLElement, list: string) {
      lists.set(list, el)
      return () => {
        if (lists.get(list) === el) {
          lists.delete(list)
        }
      }
    },
    /** Joins an item's element. Return its cleanup from the item slot's `bind`. */
    bindItem(el: HTMLElement, key: string) {
      items.set(key, el)
      return () => {
        if (items.get(key) === el) {
          items.delete(key)
        }
      }
    },
    /** The lists to render: the draft's while an item moves, else the value. Pure, so `state` and `attrs` can call it. */
    lists(state: State) {
      return (
        (state[options.draft] as TransferDraft | null)?.lists ??
        (state[options.key] as TransferLists)
      )
    },
    /** Whether an item is being moved. */
    moving(state: State, key: string) {
      return (state[options.draft] as TransferDraft | null)?.key === key
    },
    /** Whether a pointer is dragging the item. */
    dragging(state: State, key: string) {
      const current = state[options.draft] as TransferDraft | null
      return current?.key === key && current.pointer
    },
    /**
     * Handles a key pressed on an item and returns whether it did. Space or
     * Enter picks the item up; while it's up, Up and Down move it in its
     * list, Home and End to its ends, Left and Right to the next list that
     * takes it, Space or Enter drops it, Escape puts it back and Tab puts it
     * back and moves on. Every other key is swallowed while it's up.
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
      const list = listWith(current.lists, current.key) ?? current.from
      const index = current.lists[list].indexOf(current.key)
      const rtl = event.target instanceof Element && isRTL(event.target)
      const across =
        event.key === "ArrowLeft"
          ? rtl
            ? 1
            : -1
          : event.key === "ArrowRight"
            ? rtl
              ? -1
              : 1
            : 0
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault()
        drop("move-key", event)
      } else if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        cancel()
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault()
        moveTo(list, index + (event.key === "ArrowUp" ? -1 : 1))
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault()
        moveTo(list, event.key === "Home" ? 0 : current.lists[list].length)
      } else if (across && !modified) {
        event.preventDefault()
        const names = order()
        // The next list that takes it, at about the same height.
        for (
          let i = names.indexOf(list) + across;
          i >= 0 && i < names.length;
          i += across
        ) {
          if (moveTo(names[i], index)) {
            break
          }
        }
      }
      return true
    },
    /** Starts a pointer drag of an item once the pointer moves a few pixels, so a click stays a click. */
    pointerdown,
    /** Picks an item up, as Space does. Returns whether it did. */
    grab: (key: string) => grab(key, false),
    /** Moves the picked-up item to `index` in `list`, in the draft. Returns whether it moved. */
    moveTo,
    /** Drops the picked-up item where it is, committing the draft. */
    drop: (event?: Event) => drop("move-key", event),
    /** Puts the picked-up item back where it was. */
    cancel: () => cancel(),
    /** Moves an item to `index` in `list` at once, like a "Move to Done" menu item. Returns whether it went through. */
    move(key: string, list: string, index: number) {
      const from = listWith(value(), key)
      if (
        from === undefined ||
        (from !== list && options.accepts && !options.accepts(key, list))
      ) {
        return false
      }
      const next = transferred(value(), key, list, index)
      if (sameLists(next, value())) {
        return false
      }
      if (
        !options.set(next, { reason: "imperative", key, from, to: list, index })
      ) {
        return false
      }
      say("drop", key, next)
      return true
    },
  }
  return transfer
}

/**
 * What `createTransfer` returns.
 * @experimental
 */
type Transfer = ReturnType<typeof createTransfer>

export {
  createTransfer,
  type Transfer,
  type TransferDraft,
  type TransferLists,
  transferMessage,
  type TransferMessage,
  type TransferOptions,
  type TransferReason,
}
