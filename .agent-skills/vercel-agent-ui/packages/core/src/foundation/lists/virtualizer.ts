// Renders only the rows a scroller shows, measuring each as it renders and
// estimating the rest. Framework-free: an adapter renders `items()`. With
// `findable`, rows it doesn't render stay findable through hidden stand-ins.
import type { FindableHost, FindableRows, FindableSlot } from "./findable-rows"

let loading: Promise<typeof import("./findable-rows")> | undefined
const load = () => (loading ??= import("./findable-rows"))

/**
 * One row to render: where it starts along the scroller, in pixels, and its
 * size. `found` marks the row find in page matched last, until the next
 * match, until it scrolls away, or until someone presses or types in the list.
 * @experimental
 */
type VirtualItem = {
  index: number
  key: string
  start: number
  size: number
  found?: true
}

/**
 * Where `scrollToIndex` puts a row. `auto` scrolls only as far as it takes to show it.
 * @experimental
 */
type VirtualAlign = "auto" | "start" | "center" | "end"

/**
 * How `createVirtualizer` reads the list.
 * @experimental
 */
type VirtualizerOptions = {
  /** How many rows the list has. Read on every update, so it can grow, like a list that loads more. */
  count: () => number
  /** The size of a row before it's measured, in pixels. A close guess keeps the scrollbar steady. */
  estimate: (index: number) => number
  /**
   * A stable key for each row, so a measured size follows its row when the
   * list sorts or filters. Defaults to the index.
   */
  key?: (index: number) => string
  /**
   * How many rows to render past each edge, so a fast scroll or Tab doesn't
   * show a gap. @defaultValue 4
   */
  overscan?: number
  /** Whether the list scrolls sideways. @defaultValue false */
  horizontal?: boolean
  /** Pixels in the scroller before the first row, like a sticky header. @defaultValue 0 */
  scrollMargin?: number
  /**
   * Rows rendered wherever the scroller is, like the one with focus, so
   * scrolling it away doesn't drop focus to the page.
   */
  keep?: () => readonly number[]
  /**
   * Runs when the rendered rows come within `endThreshold` rows of the last,
   * to load more. Runs once per `count`, so it doesn't ask again before the
   * list grows.
   */
  onEnd?: () => void
  /** How close to the end `onEnd` runs, in rows. @defaultValue 10 */
  endThreshold?: number
  /**
   * The text the browser's find in page should find in a row, like its
   * title, so it finds rows that aren't rendered too. Keep it what the row
   * shows. Return a list of pieces to give each its own `findableText`.
   */
  findable?: (index: number) => string | readonly string[]
}

/**
 * Renders a long list by rendering only what's in view. Connect it to the
 * scroller once it mounts, render `items()` absolutely positioned inside a
 * box `size()` tall, and measure each rendered row:
 *
 * ```ts
 * const rows = createVirtualizer({ count: () => data.length, estimate: () => 36 })
 * const disconnect = rows.connect(scroller)
 * rows.subscribe(render)
 * // For each of rows.items(): <div style="position:absolute; top:{start}px" ref={(el) => rows.measure(index, el)}>
 * ```
 *
 * `items()` keeps its identity until something changes, so it works as a
 * snapshot for `useSyncExternalStore` and its kind.
 * @experimental
 */
function createVirtualizer(options: VirtualizerOptions) {
  const keyOf = (index: number) => options.key?.(index) ?? String(index)
  const sizes = new Map<string, number>()
  const listeners = new Set<() => void>()
  let scroller: HTMLElement | undefined
  let offset = 0
  let viewport = 0
  // Where each row starts, rebuilt when a count or size changes.
  let starts: number[] = []
  let dirty = true
  let snapshot: VirtualItem[] = []
  let total = 0
  let endedAt = -1
  // Each measured element and the row it shows now, which changes when the list sorts.
  const measured = new Map<Element, number>()
  let resizes: ResizeObserver | undefined

  const elements = new Map<number, HTMLElement>()
  const slots = new Map<number, (FindableSlot | undefined)[]>()
  let tokens = 0
  let foundIndex = -1
  let find: FindableRows | undefined
  // The contiguous rows in view and the overscan, apart from `keep`.
  let windowFrom = -1
  let windowTo = -1

  const margin = () => options.scrollMargin ?? 0
  const sizeOf = (index: number) =>
    sizes.get(keyOf(index)) ?? options.estimate(index)

  function layout() {
    if (!dirty && starts.length === options.count()) {
      return
    }
    dirty = false
    const count = options.count()
    starts = new Array(count)
    let at = 0
    for (let i = 0; i < count; i++) {
      starts[i] = at
      at += sizeOf(i)
    }
    total = at
  }

  // The first row whose end is past `at`, by binary search.
  function rowAt(at: number) {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = (low + high) >> 1
      if (starts[middle] + sizeOf(middle) <= at) {
        low = middle + 1
      } else {
        high = middle
      }
    }
    return Math.max(0, low)
  }

  function compute() {
    layout()
    const count = starts.length
    const overscan = options.overscan ?? 4
    const indexes = new Set<number>()
    if (count) {
      const from = rowAt(Math.max(0, offset - margin()))
      let to = from
      const end = offset - margin() + viewport
      while (to < count - 1 && starts[to] + sizeOf(to) < end) {
        to++
      }
      windowFrom = Math.max(0, from - overscan)
      windowTo = Math.min(count - 1, to + overscan)
      for (let i = windowFrom; i <= windowTo; i++) {
        indexes.add(i)
      }
      for (const index of options.keep?.() ?? []) {
        if (index >= 0 && index < count) {
          indexes.add(index)
        }
      }
      if (
        options.onEnd &&
        to >= count - 1 - (options.endThreshold ?? 10) &&
        endedAt !== count
      ) {
        endedAt = count
        queueMicrotask(() => options.onEnd?.())
      }
    }
    const next = [...indexes]
      .sort((a, b) => a - b)
      .map((index) => ({
        index,
        key: keyOf(index),
        start: starts[index],
        size: sizeOf(index),
        ...(index === foundIndex && { found: true as const }),
      }))
    const same =
      next.length === snapshot.length &&
      next.every(
        (item, i) =>
          item.key === snapshot[i].key &&
          item.start === snapshot[i].start &&
          item.size === snapshot[i].size &&
          item.index === snapshot[i].index &&
          item.found === snapshot[i].found
      )
    if (same) {
      return false
    }
    snapshot = next
    return true
  }

  function update() {
    if (!compute()) {
      return
    }
    if (
      foundIndex !== -1 &&
      !snapshot.some((item) => item.index === foundIndex)
    ) {
      foundIndex = -1
    }
    releaseSlots()
    find?.sync()
    for (const listener of [...listeners]) {
      listener()
    }
  }

  function setFound(index: number) {
    if (foundIndex === index) {
      return
    }
    foundIndex = index
    if (compute()) {
      for (const listener of [...listeners]) {
        listener()
      }
    }
  }

  const piecesOf = (index: number) => {
    const text = options.findable?.(index) ?? ""
    return typeof text === "string" ? [text] : [...text]
  }

  // Slots hold the stand-ins' own text once they load, and plain text until then.
  function adopt(index: number) {
    if (find) {
      return find.adopt(index)
    }
    const own = slots.get(index)
    if (!own || index >= options.count()) {
      return
    }
    const plain = piecesOf(index)
    own.forEach((slot, part) => {
      if (slot && slot.el.textContent !== plain[part]) {
        slot.el.textContent = plain[part] ?? ""
      }
    })
  }

  // Rows that left `items()` give their text back, also where a framework
  // calls a ref with null instead of running its cleanup.
  function releaseSlots() {
    if (!slots.size) {
      return
    }
    const shown = new Set(snapshot.map((item) => item.index))
    for (const [index, own] of slots) {
      if (shown.has(index)) {
        continue
      }
      slots.delete(index)
      own.forEach((slot, part) => slot && find?.restore(index, part, slot.el))
    }
  }

  const host: FindableHost = {
    count: () => options.count(),
    pieces: piecesOf,
    horizontal: () => !!options.horizontal,
    scroller: () => scroller,
    items: () => snapshot,
    range: () => [windowFrom, windowTo],
    elements,
    slots,
    place(index) {
      layout()
      return { start: starts[index] + margin() - offset, size: sizeOf(index) }
    },
    reveal(index) {
      foundIndex = index
      api.scrollToIndex(index, { align: "center", behavior: "instant" })
      // Already there, so the scroll didn't render it as found.
      if (!snapshot.some((item) => item.found)) {
        foundIndex = -1
        setFound(index)
      }
    },
  }

  function record(el: HTMLElement) {
    const index = measured.get(el)
    if (index === undefined) {
      return
    }
    const rect = el.getBoundingClientRect()
    const size = options.horizontal ? rect.width : rect.height
    const key = keyOf(index)
    if (!size || sizes.get(key) === size) {
      return
    }
    layout()
    // A row above the top that changes size would move what's in view, so
    // the scroller moves with it.
    const above = !!scroller && (starts[index] ?? 0) + margin() < offset
    const change = size - sizeOf(index)
    sizes.set(key, size)
    dirty = true
    if (above && scroller) {
      if (options.horizontal) {
        scroller.scrollLeft += change
      } else {
        scroller.scrollTop += change
      }
      read()
    }
    update()
  }

  function read() {
    if (!scroller) {
      return
    }
    offset = options.horizontal ? scroller.scrollLeft : scroller.scrollTop
    viewport = options.horizontal ? scroller.clientWidth : scroller.clientHeight
  }

  const api = {
    /** The rows to render now, in order. Same array until something changes. */
    items() {
      compute()
      return snapshot
    },
    /** The height, or width when horizontal, of every row together, for the box the rows sit in. */
    size() {
      layout()
      return total
    },
    /** Calls `listener` whenever `items()` changes, until the returned function runs. */
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /**
     * Reads the scroller on every scroll and resize, until the returned
     * function runs. With `findable`, also adds the layers that keep rows
     * that aren't rendered findable.
     */
    connect(
      el: HTMLElement,
      connectOptions: {
        /** Keeps rows that aren't rendered findable, through layers at the start and end of `el`. Needs the `findable` option. */
        findable?: boolean
      } = {}
    ) {
      scroller = el
      let connected = true
      if (connectOptions.findable && options.findable) {
        void load().then(({ attachFindable }) => {
          if (!connected || find) {
            return
          }
          find = attachFindable(host, el)
          for (const index of slots.keys()) {
            adopt(index)
          }
        })
      }
      // Pressing or typing in the list ends the found row.
      const done = () => {
        if (foundIndex === -1) {
          return
        }
        find?.release()
        setFound(-1)
      }
      el.addEventListener("pointerdown", done)
      el.addEventListener("keydown", done)
      const onScroll = () => {
        read()
        update()
      }
      el.addEventListener("scroll", onScroll, { passive: true })
      const view = el.ownerDocument.defaultView
      const box = view?.ResizeObserver
        ? new view.ResizeObserver(onScroll)
        : undefined
      box?.observe(el)
      onScroll()
      return () => {
        el.removeEventListener("scroll", onScroll)
        el.removeEventListener("pointerdown", done)
        el.removeEventListener("keydown", done)
        box?.disconnect()
        connected = false
        find?.detach()
        find = undefined
        if (scroller === el) {
          scroller = undefined
        }
      }
    },
    /**
     * Measures a rendered row, now and whenever it resizes, until the returned
     * function runs. Call it from the row's ref. Fixed-size rows can skip it.
     */
    measure(index: number, el: HTMLElement | null) {
      if (!el) {
        return () => {}
      }
      const first = !measured.has(el)
      // A reused element that shows another row now.
      const before = measured.get(el)
      if (
        before !== undefined &&
        before !== index &&
        elements.get(before) === el
      ) {
        elements.delete(before)
      }
      measured.set(el, index)
      elements.set(index, el)
      if (first) {
        const view = el.ownerDocument.defaultView
        if (!resizes && view?.ResizeObserver) {
          resizes = new view.ResizeObserver((entries) => {
            for (const entry of entries) {
              record(entry.target as HTMLElement)
            }
          })
        }
        resizes?.observe(el)
      }
      record(el)
      return () => {
        const shown = measured.get(el)
        measured.delete(el)
        if (shown !== undefined && elements.get(shown) === el) {
          elements.delete(shown)
        }
        resizes?.unobserve(el)
      }
    },
    /** Scrolls so a row shows, measuring as it goes. */
    scrollToIndex(
      index: number,
      {
        align = "auto",
        behavior,
      }: { align?: VirtualAlign; behavior?: ScrollBehavior } = {}
    ) {
      layout()
      if (!scroller || index < 0 || index >= starts.length) {
        return
      }
      read()
      const start = starts[index] + margin()
      const size = sizeOf(index)
      // The rows show below `scrollMargin`, like under a sticky header.
      let to = offset
      if (align === "start") {
        to = start - margin()
      } else if (align === "end") {
        to = start + size - viewport
      } else if (align === "center") {
        to = start + size / 2 - (viewport + margin()) / 2
      } else if (start < offset + margin()) {
        to = start - margin()
      } else if (start + size > offset + viewport) {
        to = start + size - viewport
      }
      if (to === offset) {
        return
      }
      scroller.scrollTo({
        [options.horizontal ? "left" : "top"]: Math.max(0, to),
        behavior,
      })
      read()
      update()
    },
    /** Reads the list again, like after its rows change without a scroll. Find in page sees the new text. */
    refresh() {
      dirty = true
      read()
      update()
      if (find) {
        find.refresh()
      } else {
        for (const index of slots.keys()) {
          adopt(index)
        }
      }
    },
    /**
     * Renders a piece of a row's `findable` text into `el`, from the row's
     * ref, until the returned function runs. Render `el` empty: it holds the
     * very text find in page searches, so the browser highlights the match in
     * the row itself. `part` picks the piece when `findable` returns several.
     */
    findableText(index: number, el: HTMLElement | null, part = 0) {
      if (!el) {
        return () => {}
      }
      const own = slots.get(index) ?? []
      const token = ++tokens
      own[part] = { el, token }
      slots.set(index, own)
      adopt(index)
      return () => {
        // A ref that runs again with the same element in the same render keeps its text.
        queueMicrotask(() => {
          const list = slots.get(index)
          if (list?.[part]?.token !== token) {
            return
          }
          list[part] = undefined
          if (!list.some(Boolean)) {
            slots.delete(index)
          }
          find?.restore(index, part, el)
        })
      }
    },
    /** Forgets every measured size, like after a change that resizes every row. */
    reset() {
      sizes.clear()
      api.refresh()
    },
  }
  return api
}

/**
 * What `createVirtualizer` returns.
 * @experimental
 */
type Virtualizer = ReturnType<typeof createVirtualizer>

export {
  createVirtualizer,
  type VirtualAlign,
  type VirtualItem,
  type Virtualizer,
  type VirtualizerOptions,
}
