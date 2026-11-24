// Rows move like Tree's, on `createRovingFocus` and a tree collection. Cells
// are found in the row's DOM, so a row holds any columns: Right enters them,
// Left leaves them, Up and Down keep the column, and only the focused one is a tab stop.
import { isRTL } from "../../foundation/platform/env"
import { createRovingFocus } from "../../foundation/focus/roving-focus"
import {
  createTypeahead,
  isTypeaheadKey,
} from "../../foundation/text/typeahead"
import { createChange } from "../../foundation/kernel/input-source"
import type { ChangeOptions } from "../../foundation/kernel/details"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import {
  createTreeCollection,
  treeDataNodes,
  visibleTreeRows,
  type TreeCollection,
} from "../../foundation/lists/tree-collection"
import type { NumberFormat } from "../../foundation/number/format"
import { clamp } from "../../foundation/number/steps"
import { localeOf } from "../../foundation/text/locale"
import {
  formatTime,
  percentAt,
  spanPlacement,
  spanRange,
  waterfallTicks,
  type WaterfallTickData,
} from "./waterfall-time"
import type {
  WaterfallData,
  WaterfallDataItem,
  WaterfallDataRow,
  WaterfallExpandedChangeReason,
  WaterfallOptions,
  WaterfallValueChangeReason,
} from "./waterfall"

type WaterfallStore = {
  items: WaterfallData
  range: [number, number] | undefined
  value: string | null
  expanded: string[]
  // The row with the tab stop, null until rows bind.
  active: string | null
  // The row one of whose cells has focus, so the cell holds the tab stop instead.
  cell: string | null
  format: NumberFormat | undefined
  locale: string | undefined
  // The page's language, read once the root binds. Null on the server.
  pageLocale: string | null
  getBarLabel: WaterfallOptions["getBarLabel"]
}

type Why<Reason> = { reason: Reason; event?: Event }

const cellSelector = '[role="gridcell"], [role="rowheader"]'

// A row's cells in order, not counting those of a waterfall nested in one.
const cellsOf = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLElement>(cellSelector)).filter(
    (cell) => cell.closest('[role="row"]') === row
  )

const defaultBarLabel = (
  _item: WaterfallDataItem,
  { start, duration }: { start: string; duration: string }
) => `Starts at ${start}, lasts ${duration}`

/**
 * The rows that show when only the spans in `expanded` are open, in order,
 * for a waterfall that renders only the rows in view. Render each as a
 * `WaterfallRow` with its span's `value`.
 * @experimental
 */
function visibleWaterfallRows(
  items: readonly WaterfallDataItem[],
  expanded: readonly string[]
) {
  return visibleTreeRows(items, expanded) as WaterfallDataRow[]
}

/**
 * `waterfall`'s api, which its slots and controller call. Adapters expose it as `api`.
 * @experimental
 */
interface WaterfallApi extends ReturnType<typeof waterfallApiBody> {}

function waterfallApiBody(
  context: PrimitiveContext<WaterfallOptions, WaterfallStore, string>
) {
  const { id, store, options } = context
  const change = createChange(context)
  const typeahead = createTypeahead()
  const rowElement = (key: string | null | undefined) =>
    key == null ? undefined : context.element("row", key)

  // The shape and the spans by value, kept until `items` changes.
  let data:
    | {
        items: WaterfallData
        tree: TreeCollection
        byKey: Map<string, WaterfallDataItem>
        all: WaterfallDataItem[]
        range: [number, number]
      }
    | undefined
  function known() {
    const { items } = store.get()
    if (data?.items !== items) {
      const nodes = treeDataNodes(items)
      data = {
        items,
        tree: createTreeCollection(nodes),
        byKey: new Map(
          nodes.map((node) => [node.key, node.item as WaterfallDataItem])
        ),
        all: nodes.map((node) => node.item as WaterfallDataItem),
        range: spanRange(items),
      }
    }
    return data
  }

  const range = (state = store.get()) => state.range ?? known().range

  // The rows that show, and each one's place among them, kept while `expanded` holds the same keys.
  let shown: { keys: readonly string[]; index: Map<string, number> } | undefined
  function visible() {
    const keys = known().tree.visible(store.get().expanded)
    if (shown?.keys !== keys) {
      shown = { keys, index: new Map(keys.map((key, index) => [key, index])) }
    }
    return shown
  }

  const isBranch = (key: string) => known().tree.isBranch(key)
  const ancestors = (key: string) => known().tree.ancestors(key)
  const parentOf = (key: string) => known().tree.parent(key)

  // Whether every ancestor is expanded, so the row shows. One set per expanded list.
  let openFor: readonly string[] | undefined
  let open = new Set<string>()
  function shows(key: string, expanded: readonly string[]) {
    if (expanded !== openFor) {
      open = new Set((openFor = expanded))
    }
    return ancestors(key).every((ancestor) => open.has(ancestor))
  }

  const roving = createRovingFocus<WaterfallStore, { value: string }>(context, {
    slot: "row",
    key: "active",
    focusable: (row) => shows(row.key, store.get().expanded),
    preferred: (row) => store.get().value === row.key,
    // On the server, the selected row holds the stop when it shows, else the first row.
    claims: (state, row) => {
      if (!shows(row.key, state.expanded)) {
        return false
      }
      const selected = state.value
      return (
        selected === null ||
        !known().tree.has(selected) ||
        !shows(selected, state.expanded) ||
        row.key === selected
      )
    },
  })

  // The cell with the tab stop, which only it writes, so a render never resets it.
  let stopCell: HTMLElement | null = null
  function holdCell(cell: HTMLElement | null) {
    if (stopCell && stopCell !== cell) {
      stopCell.tabIndex = -1
    }
    stopCell = cell
    if (cell) {
      cell.tabIndex = 0
    }
  }

  // A cell to focus once its row renders, for a key that moved to a row not rendered yet.
  let pendingCell: { key: string; column: number } | null = null

  function focusCell(row: HTMLElement, column: number) {
    const cells = cellsOf(row)
    const cell = cells[Math.min(column, cells.length) - 1]
    if (cell) {
      cell.focus()
    } else {
      row.focus()
    }
  }

  // Moves focus to a row, or to the cell in `column` of it, from 1, and reports it.
  function moveTo(key: string, column: number, event?: KeyboardEvent) {
    options().onHighlight?.(key, {
      index: visible().index.get(key) ?? -1,
      event,
    })
    const row = rowElement(key)
    if (column === 0 || !row) {
      pendingCell = column === 0 ? null : { key, column }
      roving.focus(key)
      return
    }
    focusCell(row, column)
  }

  function setValue(
    value: string | null,
    why: Why<WaterfallValueChangeReason>
  ) {
    return change("value", value, why)
  }

  function setExpanded(
    expanded: string[],
    why: Why<WaterfallExpandedChangeReason>
  ) {
    return change("expanded", [...new Set(expanded)], why)
  }

  function setOpen(
    key: string,
    opening: boolean,
    why: Why<WaterfallExpandedChangeReason>
  ) {
    const { expanded } = store.get()
    if (!isBranch(key) || expanded.includes(key) === opening) {
      return false
    }
    return setExpanded(
      opening ? [...expanded, key] : expanded.filter((other) => other !== key),
      why
    )
  }

  // Focus in a row that a collapse hides goes to the outermost collapsed ancestor.
  let seen = store.get().expanded
  context.onDestroy(
    store.subscribe(() => {
      const { expanded, active } = store.get()
      if (expanded === seen) {
        return
      }
      seen = expanded
      if (active === null || shows(active, expanded)) {
        return
      }
      const target = ancestors(active).find((key) => !expanded.includes(key))
      const row = rowElement(active)
      const doc = row?.ownerDocument
      const held = !row || row.contains(doc?.activeElement ?? null)
      if (target === undefined) {
        return
      }
      holdCell(null)
      store.set({ cell: null })
      roving.remember(target)
      if (held) {
        queueMicrotask(() => {
          const now = rowElement(target)?.ownerDocument.activeElement
          if (
            !now ||
            now === now.ownerDocument.body ||
            !now.isConnected ||
            row?.contains(now)
          ) {
            roving.focus(target)
          }
        })
      }
    })
  )

  function press(key: string, el: HTMLElement | undefined, event?: Event) {
    const active =
      typeof document === "undefined" ? null : document.activeElement
    // A press on a cell focuses the cell; anywhere else in the row focuses the row.
    if (el && !(active instanceof HTMLElement && el.contains(active))) {
      el.focus({ preventScroll: true })
    }
    if (store.get().active !== key) {
      roving.remember(key)
    }
    if (store.get().value !== key) {
      setValue(key, { reason: "item-press", event })
    }
  }

  function keydown(event: KeyboardEvent, row: HTMLElement, key: string) {
    const target = event.target
    if (
      event.defaultPrevented ||
      event.altKey ||
      !(target instanceof HTMLElement) ||
      target.closest('[role="row"]') !== row
    ) {
      return
    }
    const cells = cellsOf(row)
    const column = target === row ? 0 : cells.indexOf(target) + 1
    // Keys inside a cell's own controls, like a link, stay theirs.
    if (target !== row && column === 0) {
      return
    }
    const mod = event.ctrlKey || event.metaKey
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight"
    const rtl = horizontal && isRTL(row)
    const forward = rtl ? "ArrowLeft" : "ArrowRight"
    const backward = rtl ? "ArrowRight" : "ArrowLeft"
    const { keys, index } = visible()
    const at = index.get(key) ?? 0
    const last = keys.length - 1
    const toRow = (to: number) =>
      moveTo(keys[clamp(to, 0, last)], column, event)

    if (event.key === "ArrowDown" && !mod) {
      toRow(at + 1)
    } else if (event.key === "ArrowUp" && !mod) {
      toRow(at - 1)
    } else if (event.key === "PageDown") {
      toRow(at + pageSize(row))
    } else if (event.key === "PageUp") {
      toRow(at - pageSize(row))
    } else if (event.key === "Home") {
      if (column > 0 && !mod) {
        cells[0].focus()
      } else {
        toRow(0)
      }
    } else if (event.key === "End") {
      if (column > 0 && !mod) {
        cells[cells.length - 1].focus()
      } else {
        toRow(last)
      }
    } else if (event.key === forward && !mod) {
      const expanded = store.get().expanded.includes(key)
      if (column === 0 && isBranch(key) && !expanded) {
        setOpen(key, true, { reason: "list-navigation", event })
      } else if (column < cells.length) {
        cells[column].focus()
      }
    } else if (event.key === backward && !mod) {
      if (column > 1) {
        cells[column - 2].focus()
      } else if (column === 1) {
        row.focus()
      } else if (store.get().expanded.includes(key)) {
        setOpen(key, false, { reason: "list-navigation", event })
      } else {
        const parent = parentOf(key)
        if (parent === null) {
          return
        }
        moveTo(parent, 0, event)
      }
    } else if (
      (event.key === "Enter" || (event.key === " " && !typeahead.active())) &&
      !mod
    ) {
      setValue(key, { reason: "item-press", event })
    } else if (isTypeaheadKey(event)) {
      const byKey = known().byKey
      const found = typeahead(
        event.key,
        keys.map((other) => byKey.get(other)?.label ?? other),
        at
      )
      if (found === -1) {
        return
      }
      moveTo(keys[found], 0, event)
    } else {
      return
    }
    event.preventDefault()
  }

  // How many rows Page Up and Page Down move: as many as the scroller around the rows shows, less one.
  function pageSize(row: HTMLElement) {
    const height = row.offsetHeight
    let scroller = row.parentElement
    while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
      scroller = scroller.parentElement
    }
    const view = scroller?.clientHeight ?? 0
    return height > 0 && view > height ? Math.floor(view / height) - 1 : 10
  }

  // Focus landing on a row or one of its cells moves the tab stop there.
  function focusin(event: FocusEvent, row: HTMLElement, key: string) {
    const target = event.target
    if (
      !(target instanceof HTMLElement) ||
      target.closest('[role="row"]') !== row
    ) {
      return
    }
    if (target === row) {
      holdCell(null)
      store.set({ cell: null })
      return
    }
    if (!target.matches(cellSelector)) {
      return
    }
    holdCell(target)
    roving.remember(key)
    store.set({ cell: key })
  }

  // Ticks and time states, kept per range, locale and format, so a render reads the same array.
  let ticksFor:
    | {
        range: readonly number[]
        locale: string
        format: unknown
        max: number
        ticks: WaterfallTickData[]
      }
    | undefined
  function ticks(state: WaterfallStore, max: number) {
    const now = range(state)
    const locale = localeOf(state)
    if (
      ticksFor &&
      ticksFor.range[0] === now[0] &&
      ticksFor.range[1] === now[1] &&
      ticksFor.locale === locale &&
      ticksFor.format === state.format &&
      ticksFor.max === max
    ) {
      return ticksFor.ticks
    }
    const list = waterfallTicks(now, max, locale, state.format)
    ticksFor = {
      range: [now[0], now[1]],
      locale,
      format: state.format,
      max,
      ticks: list,
    }
    return list
  }

  const imperative = <Reason extends string>(why?: ChangeOptions<Reason>) => ({
    reason: (why?.reason ?? "imperative") as Reason,
    event: why?.event,
  })

  const api = {
    id,
    roving,
    getValue: () => store.get().value,
    setValue: (
      value: string | null,
      why?: ChangeOptions<WaterfallValueChangeReason>
    ) => setValue(value, imperative(why)),
    getExpanded: () => store.get().expanded,
    setExpanded: (
      expanded: string[],
      why?: ChangeOptions<WaterfallExpandedChangeReason>
    ) => setExpanded(expanded, imperative(why)),
    isExpanded: (value: string) => store.get().expanded.includes(value),
    expand: (
      value: string,
      why?: ChangeOptions<WaterfallExpandedChangeReason>
    ) => setOpen(value, true, imperative(why)),
    collapse: (
      value: string,
      why?: ChangeOptions<WaterfallExpandedChangeReason>
    ) => setOpen(value, false, imperative(why)),
    toggle: (
      value: string,
      why?: ChangeOptions<WaterfallExpandedChangeReason>
    ) => setOpen(value, !store.get().expanded.includes(value), imperative(why)),
    expandAll: (why?: ChangeOptions<WaterfallExpandedChangeReason>) =>
      setExpanded(known().tree.keys().filter(isBranch), imperative(why)),
    collapseAll: (why?: ChangeOptions<WaterfallExpandedChangeReason>) =>
      setExpanded([], imperative(why)),
    reveal(value: string) {
      if (!known().tree.has(value)) {
        return
      }
      const { expanded } = store.get()
      const hidden = ancestors(value).filter((key) => !expanded.includes(key))
      if (
        hidden.length &&
        !setExpanded([...expanded, ...hidden], { reason: "imperative" })
      ) {
        return
      }
      // A controlled waterfall shows the row once its `expanded` comes back, a render later.
      queueMicrotask(() => moveTo(value, 0))
    },
    focus: (value?: string) => roving.focus(value),
    internal: {
      items: () => store.get().items,
      // Every span, parents before children, for a waterfall that renders all its rows.
      all: () => known().all,
      range,
      isBranch,
      ancestors,
      shows,
      level: (key: string) => known().tree.level(key),
      position(key: string) {
        const tree = known().tree
        return tree.has(key) ? tree.position(key) : undefined
      },
      placement(state: WaterfallStore, key: string) {
        const item = known().byKey.get(key)
        return item ? spanPlacement(item, range(state)) : { start: 0, size: 0 }
      },
      tabIndex: (
        state: WaterfallStore,
        part: { key: string; props: { value: string } }
      ) => (state.cell === part.key ? "-1" : roving.tabIndex(state, part)),
      ticks,
      timeState(state: WaterfallStore, time: number) {
        const now = range(state)
        const scale = Math.max(Math.abs(now[0]), Math.abs(now[1]))
        return {
          time,
          label: formatTime(time, localeOf(state), state.format, scale),
          position: percentAt(time, now),
          outside: time < now[0] || time > now[1],
        }
      },
      barLabel(state: WaterfallStore, key: string) {
        const item = known().byKey.get(key)
        if (!item) {
          return undefined
        }
        const locale = localeOf(state)
        return (state.getBarLabel ?? defaultBarLabel)(item, {
          start: formatTime(item.start, locale, state.format),
          duration: formatTime(item.duration, locale, state.format),
        })
      },
      press,
      keydown,
      focusin,
      pressIndicator(key: string, event?: Event) {
        // The row's press would select it too. Focus goes to the row, where Left and Right expand.
        event?.preventDefault()
        rowElement(key)?.focus({ preventScroll: true })
        setOpen(key, !store.get().expanded.includes(key), {
          reason: "trigger-press",
          event,
        })
      },
      bindRow(
        el: HTMLElement,
        part: { key: string; props: { value: string } }
      ) {
        const leave = roving.bind(el, part)
        if (pendingCell?.key === part.key) {
          const { column } = pendingCell
          pendingCell = null
          queueMicrotask(() => {
            const doc = el.ownerDocument
            if (doc.activeElement === el || doc.activeElement === doc.body) {
              focusCell(el, column)
            }
          })
        }
        return () => {
          if (stopCell && el.contains(stopCell)) {
            holdCell(null)
          }
          if (store.get().cell === part.key) {
            store.set({ cell: null })
          }
          leave()
        }
      },
    },
  }
  return api
}

const waterfallApi: (
  ...args: Parameters<typeof waterfallApiBody>
) => WaterfallApi = waterfallApiBody

export {
  visibleWaterfallRows,
  type WaterfallApi,
  waterfallApi,
  type WaterfallStore,
}
