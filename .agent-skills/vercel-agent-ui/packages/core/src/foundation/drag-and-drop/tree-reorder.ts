// Reordering a tree: an outline, a sidebar of pages, folders of files. The
// tree is a flat list of rows in reading order, each with its depth, so an
// item and its children are one block of rows. A drag moves the block up and
// down between the rows on screen, and sideways in and out of levels; the
// keyboard does the same with the arrows. Like `createReorder`, the rows move
// through a draft in state that renders as it changes, only the drop commits,
// and screen readers hear each step.
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
 * One row of a tree in reading order: its key and how deep it is, from 0.
 * @experimental
 */
type TreeReorderRow = { key: string; depth: number }

/**
 * The item being moved and the rows as they show now, kept in state under `TreeReorderOptions.draft`.
 * @experimental
 */
type TreeReorderDraft = {
  /** The key of the item picked up. */
  key: string
  /** The item and every row under it, which move with it. */
  keys: string[]
  /** Every row as it shows now, the moving ones included. */
  rows: TreeReorderRow[]
  /** Whether a pointer is dragging it, rather than the keyboard moving it. */
  pointer: boolean
}

/**
 * Why the rows changed: a pointer drag, a keyboard move, or a call from code.
 * @experimental
 */
type TreeReorderReason = "drag" | "move-key" | "imperative"

/**
 * Where an item went: under which parent, and its place among that parent's children.
 * @experimental
 */
type TreePlace = {
  /** The parent's key, or `null` at the top level. */
  parent: string | null
  /** Its place among the parent's children, from 0. */
  index: number
}

/**
 * What happened, for the message screen readers hear.
 * @experimental
 */
type TreeReorderMessage = {
  /** `grab` when an item is picked up, `move` for each step, `drop` when it lands, `cancel` when it goes back. */
  type: "grab" | "move" | "drop" | "cancel"
  /** The item's key. */
  key: string
  /** What the item is called, from `label`, else its text. */
  label: string
  /** What its parent is called, or `undefined` at the top level. */
  parent: string | undefined
  /** Its level, from 1. */
  level: number
  /** Its place among its siblings, from 1. */
  position: number
  /** How many siblings it has, itself included. */
  total: number
}

/**
 * How `createTreeReorder` reads, renders and changes the rows.
 * @experimental
 */
type TreeReorderOptions<State extends object> = {
  /** The state key that holds the rows, a `TreeReorderRow[]` in reading order. */
  key: keyof State & string
  /** The state key that holds the `TreeReorderDraft` while an item moves. Start it at `null`. */
  draft: keyof State & string
  /**
   * Asks for the new rows and returns whether they went through. Pass the
   * primitive's change: `set: (value, details) => change("rows", value, details)`.
   * `details` says which item moved and where to.
   */
  set: (
    value: TreeReorderRow[],
    details: {
      reason: TreeReorderReason
      event?: Event
      key: string
    } & TreePlace
  ) => boolean
  /** How far a drag goes sideways for each level, in CSS pixels. Defaults to 24. */
  indent?: () => number
  /** The deepest an item and the rows under it can go, from 0. Defaults to no limit. */
  maxDepth?: () => number
  /** Whether an item can't be picked up. It still moves aside for others. */
  disabled?: (key: string) => boolean
  /** The name screen readers hear for an item. Defaults to its text. */
  label?: (key: string) => string | undefined
  /** The text screen readers hear for each step. Defaults to English. */
  message?: (message: TreeReorderMessage) => string
  /** Drags a copy of the row above the page while the rows show where it would drop. Defaults to `false`. */
  preview?: boolean
  /** How a drag with `preview` near a scroller's edge scrolls it, or `false` not to. */
  createAutoScroll?: Omit<AutoScrollOptions, "onScroll" | "ignore"> | false
}

/**
 * The English messages `createTreeReorder` announces unless you pass `message`.
 * @experimental
 */
function treeReorderMessage({
  type,
  label,
  parent,
  level,
  position,
  total,
}: TreeReorderMessage) {
  const at = `level ${level}${parent ? ` in ${parent}` : ""}, position ${position} of ${total}`
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

/**
 * The index past the last row under `rows[index]`.
 * @experimental
 */
function subtreeEnd(rows: readonly TreeReorderRow[], index: number) {
  let end = index + 1
  while (end < rows.length && rows[end].depth > rows[index].depth) {
    end++
  }
  return end
}

/** The parent of `rows[index]` and its place among the parent's children. */
function placeOf(rows: readonly TreeReorderRow[], index: number) {
  const depth = rows[index].depth
  let parent: number | undefined
  let position = 0
  for (let i = index - 1; i >= 0 && parent === undefined; i--) {
    if (rows[i].depth === depth) {
      position++
    } else if (rows[i].depth < depth) {
      parent = i
    }
  }
  return { parent, position }
}

/**
 * The depths a block can take between two rows without changing anyone
 * else's parent: no deeper than the row above's child, and no shallower
 * than the row below, which would adopt it.
 */
function depthRange(
  above: TreeReorderRow | undefined,
  below: TreeReorderRow | undefined,
  maxDepth = Infinity
) {
  const max = Math.min(maxDepth, above ? above.depth + 1 : 0)
  const min = below ? below.depth : 0
  return { min: Math.min(min, max), max }
}

// The deepest an item can go so the deepest row under it stays within `maxDepth`.
function blockMaxDepth(
  rows: readonly TreeReorderRow[],
  keys: ReadonlySet<string>,
  maxDepth?: number
) {
  if (maxDepth === undefined) {
    return undefined
  }
  const block = rows.filter((row) => keys.has(row.key))
  const below = Math.max(...block.map((row) => row.depth)) - block[0].depth
  return Math.max(0, maxDepth - below)
}

/**
 * The rows with the block at `key` moved before the row `before`, or to the
 * end, at `depth`, its children keeping their depths under it. The same
 * array when it's already there.
 */
function movedRows(
  rows: readonly TreeReorderRow[],
  key: string,
  before: string | null,
  depth: number
) {
  const from = rows.findIndex((row) => row.key === key)
  if (from < 0) {
    return rows as TreeReorderRow[]
  }
  const end = subtreeEnd(rows, from)
  const shift = depth - rows[from].depth
  const block = rows
    .slice(from, end)
    .map((row) => (shift ? { key: row.key, depth: row.depth + shift } : row))
  const rest = [...rows.slice(0, from), ...rows.slice(end)]
  const at =
    before === null ? rest.length : rest.findIndex((row) => row.key === before)
  if (at < 0) {
    return rows as TreeReorderRow[]
  }
  if (!shift && at === from) {
    return rows as TreeReorderRow[]
  }
  rest.splice(at, 0, ...block)
  return rest
}

// `movedRows` with the depth held where the block fits between its new neighbors.
function placedRows(
  rows: readonly TreeReorderRow[],
  key: string,
  before: string | null,
  depth: number,
  maxDepth?: number
) {
  const from = rows.findIndex((row) => row.key === key)
  if (from < 0) {
    return rows as TreeReorderRow[]
  }
  const block = new Set(
    rows.slice(from, subtreeEnd(rows, from)).map((row) => row.key)
  )
  const rest = rows.filter((row) => !block.has(row.key))
  const at =
    before === null ? rest.length : rest.findIndex((row) => row.key === before)
  const range = depthRange(
    rest[at - 1],
    rest[at],
    blockMaxDepth(rows, block, maxDepth)
  )
  return movedRows(
    rows,
    key,
    before,
    Math.max(range.min, Math.min(range.max, depth))
  )
}

const sameRows = (a: readonly TreeReorderRow[], b: readonly TreeReorderRow[]) =>
  a.length === b.length &&
  a.every((row, i) => row.key === b[i].key && row.depth === b[i].depth)

/**
 * Lets users reorder and nest a tree's rows by dragging them and with the
 * keyboard. Render the rows from `rows(state)`, each indented by its depth,
 * and leave out the ones inside collapsed items: only rows with an element
 * take part. Call it once in `api`, keep it on the api, and wire the row
 * slot:
 *
 * ```ts
 * row: slot<{ value: string }>({
 *   on: {
 *     keydown: (event, { el, api, key }) => api.tree.keydown(event, key) || api.roving.keydown(event, el!),
 *     pointerdown: (event, { api, key }) => api.tree.pointerdown(event, key),
 *   },
 *   bind: (el, { api, key }) => api.tree.bind(el, key),
 * })
 * ```
 *
 * Space or Enter picks a row up with everything under it; then Up and Down
 * move it between the rows on screen, Left and Right take it out a level and
 * in one, Space or Enter drops it, and Escape puts it back. A drag goes in a
 * level for every `indent` it goes sideways. An item never takes another's
 * children: where the row below is deeper, the item goes in as deep.
 * @experimental
 */
function createTreeReorder<State extends object>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: TreeReorderOptions<State>
) {
  const { store } = context
  const elements = new Map<string, HTMLElement>()
  const { draft, value, setDraft, focusLater, drop, cancel } = createDraftMove({
    store,
    draft: options.draft,
    value: options.key,
    shown: (current: TreeReorderDraft) => current.rows,
    same: sameRows,
    rebase(current, now, moved) {
      const index = now.findIndex((row) => row.key === current.key)
      if (index < 0) {
        return null
      }
      const keys = now
        .slice(index, subtreeEnd(now, index))
        .map((row) => row.key)
      if (!moved) {
        return { ...current, keys, rows: now }
      }
      const present = new Set(now.map((row) => row.key))
      const at = current.rows.findIndex((row) => row.key === current.key)
      const before = current.rows
        .slice(at)
        .find(
          (row) =>
            present.has(row.key) &&
            !current.keys.includes(row.key) &&
            !keys.includes(row.key)
        )
      const rows = placedRows(
        now,
        current.key,
        before?.key ?? null,
        current.rows[at].depth,
        options.maxDepth?.()
      )
      return { ...current, keys, rows }
    },
    commit: (current, details) => commit(current.rows, current.key, details),
    say: (type, current, rows) => say(type, current.key, rows),
    element: (key) => elements.get(key),
  })
  const shown = (row: TreeReorderRow) => !!elements.get(row.key)?.isConnected

  function say(
    type: TreeReorderMessage["type"],
    key: string,
    rows: readonly TreeReorderRow[]
  ) {
    const index = rows.findIndex((row) => row.key === key)
    if (index < 0) {
      return
    }
    const { parent, position } = placeOf(rows, index)
    let total = 0
    const depth = rows[index].depth
    for (
      let i = parent === undefined ? 0 : parent + 1;
      i < rows.length && rows[i].depth >= depth;
      i++
    ) {
      if (rows[i].depth === depth) {
        total++
      }
    }
    const name = (k: string) =>
      options.label?.(k) ?? (elements.get(k) ? labelOf(elements.get(k)!) : k)
    const message = {
      type,
      key,
      label: name(key),
      parent: parent === undefined ? undefined : name(rows[parent].key),
      level: depth + 1,
      position: position + 1,
      total,
    }
    announce((options.message ?? treeReorderMessage)(message), {
      priority: "assertive",
    })
  }

  // The depth the keyboard aims for: where the item started, or where Left
  // and Right last put it, so moving through a deeper branch doesn't keep it there.
  let aim = 0

  function grab(key: string, pointer: boolean) {
    const rows = value()
    const index = rows.findIndex((row) => row.key === key)
    if (draft() || index < 0 || options.disabled?.(key)) {
      return false
    }
    aim = rows[index].depth
    const keys = rows
      .slice(index, subtreeEnd(rows, index))
      .map((row) => row.key)
    setDraft({ key, keys, rows, pointer })
    say("grab", key, rows)
    return true
  }

  // The rows on screen other than the moving block, and the block's slot among them.
  function slots(current: TreeReorderDraft) {
    const others = current.rows.filter(
      (row) => !current.keys.includes(row.key) && shown(row)
    )
    const at = current.rows.findIndex((row) => row.key === current.key)
    const slot = current.rows
      .slice(0, at)
      .filter((row) => !current.keys.includes(row.key) && shown(row)).length
    return { others, slot, depth: current.rows[at].depth }
  }

  // Moves the block to `slot` among the other rows on screen, as near `depth` as fits there.
  function place(slot: number, depth: number) {
    const current = draft()
    if (!current) {
      return false
    }
    const { others } = slots(current)
    const to = Math.max(0, Math.min(others.length, slot))
    const deepest = blockMaxDepth(
      current.rows,
      new Set(current.keys),
      options.maxDepth?.()
    )
    const range = depthRange(others[to - 1], others[to], deepest)
    const fitted = Math.max(range.min, Math.min(range.max, depth))
    const rows = movedRows(
      current.rows,
      current.key,
      others[to]?.key ?? null,
      fitted
    )
    if (rows === current.rows) {
      return false
    }
    setDraft({ ...current, rows })
    say("move", current.key, rows)
    if (!current.pointer) {
      focusLater(current.key)
    }
    return true
  }

  function commit(
    rows: TreeReorderRow[],
    key: string,
    details: { reason: TreeReorderReason; event?: Event }
  ) {
    const index = rows.findIndex((row) => row.key === key)
    const { parent, position } = placeOf(rows, index)
    return options.set(rows, {
      ...details,
      key,
      parent: parent === undefined ? null : rows[parent].key,
      index: position,
    })
  }

  const drags = createDragSession(context.onDestroy)

  function pointerdown(event: PointerEvent, key: string) {
    const el = elements.get(key)
    if (!el || !drags.accepts(event) || draft()) {
      return
    }
    const start = { x: event.clientX, y: event.clientY }
    let point = start
    let startDepth = 0
    let lastMove: PointerEvent | undefined
    let preview: DragPreview | undefined
    let dragging = false
    const track = () => {
      const current = draft()
      if (!current) {
        return
      }
      const { others } = slots(current)
      const middles = others.map((row) => {
        const rect = elements.get(row.key)!.getBoundingClientRect()
        return rect.top + rect.height / 2
      })
      const sideways = (point.x - start.x) * (isRTL(el) ? -1 : 1)
      place(
        dropIndex(middles, point.y),
        startDepth + Math.round(sideways / (options.indent?.() ?? 24))
      )
    }
    const scroller =
      !options.preview || options.createAutoScroll === false
        ? undefined
        : createAutoScroll({
            ...options.createAutoScroll,
            ignore: () => elements.get(key),
            onScroll: track,
          })
    drags.start(el, event, {
      threshold: dragThreshold,
      cancelOnEscape: true,
      onStart: () => {
        if (!grab(key, true)) {
          return false
        }
        startDepth = value().find((row) => row.key === key)?.depth ?? 0
        dragging = true
        if (options.preview) {
          preview = bindDragPreview(el, start)
          preview.el.removeAttribute("data-moving")
          preview.el.removeAttribute("data-dragging")
          const count = draft()?.keys.length ?? 1
          if (count > 1) {
            preview.el.setAttribute("data-drag-count", String(count))
          }
        }
      },
      onMove: ({ x, y, event: moveEvent }) => {
        moveEvent.preventDefault()
        lastMove = moveEvent
        point = { x, y }
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
      },
    })
  }

  const tree = {
    /** Joins a row's element. Return its cleanup from the row slot's `bind`. */
    bind(el: HTMLElement, key: string) {
      elements.set(key, el)
      return () => {
        if (elements.get(key) === el) {
          elements.delete(key)
        }
      }
    },
    /** The rows to render: the draft's while an item moves, else the value. Pure, so `state` and `attrs` can call it. */
    rows(state: State) {
      return (
        (state[options.draft] as TreeReorderDraft | null)?.rows ??
        (state[options.key] as TreeReorderRow[])
      )
    },
    /** Whether a row is picked up, by itself or under the item that is. */
    moving(state: State, key: string) {
      return !!(state[options.draft] as TreeReorderDraft | null)?.keys.includes(
        key
      )
    },
    /** Whether a pointer is dragging the row, by itself or under the item it drags. */
    dragging(state: State, key: string) {
      const current = state[options.draft] as TreeReorderDraft | null
      return !!current?.pointer && current.keys.includes(key)
    },
    /**
     * Handles a key pressed on a row and returns whether it did. Space or
     * Enter picks the row up; while it's up, Up and Down move it between the
     * rows on screen, Left and Right out a level and in one, Space or Enter
     * drops it, Escape puts it back, and Tab puts it back and moves on.
     * Every other key is swallowed while it's up.
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
      const { slot, depth, others } = slots(current)
      const rtl = event.target instanceof Element && isRTL(event.target)
      const inward = event.key === (rtl ? "ArrowLeft" : "ArrowRight")
      const outward = event.key === (rtl ? "ArrowRight" : "ArrowLeft")
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault()
        drop("move-key", event)
      } else if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        cancel()
      } else if (modified) {
        // Swallowed, like every other key while a row is up.
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault()
        place(slot + (event.key === "ArrowUp" ? -1 : 1), aim)
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault()
        place(event.key === "Home" ? 0 : others.length, aim)
      } else if (inward || outward) {
        event.preventDefault()
        if (place(slot, depth + (inward ? 1 : -1))) {
          aim = slots(draft()!).depth
        }
      }
      return true
    },
    /** Starts a pointer drag of a row once the pointer moves a few pixels, so a click stays a click. */
    pointerdown,
    /** Picks a row up, as Space does. Returns whether it did. */
    grab: (key: string) => grab(key, false),
    /** Moves the picked-up row to `slot` among the other rows on screen, as near `depth` as fits there. */
    place,
    /** Drops the picked-up row where it is, committing the draft. */
    drop: (event?: Event) => drop("move-key", event),
    /** Puts the picked-up row back where it was. */
    cancel: () => cancel(),
    /**
     * Moves an item and its children before the row `before`, or to the end,
     * at `depth` as near as fits there, like an "Indent" menu item. Returns
     * whether it went through.
     */
    move(key: string, before: string | null, depth: number) {
      const rows = value()
      const next = placedRows(rows, key, before, depth, options.maxDepth?.())
      if (next === rows || !commit(next, key, { reason: "imperative" })) {
        return false
      }
      say("drop", key, next)
      return true
    },
  }
  return tree
}

/**
 * What `createTreeReorder` returns.
 * @experimental
 */
type TreeReorder = ReturnType<typeof createTreeReorder>

export {
  createTreeReorder,
  depthRange,
  movedRows,
  placeOf,
  subtreeEnd,
  type TreePlace,
  type TreeReorder,
  type TreeReorderDraft,
  treeReorderMessage,
  type TreeReorderMessage,
  type TreeReorderOptions,
  type TreeReorderReason,
  type TreeReorderRow,
}
