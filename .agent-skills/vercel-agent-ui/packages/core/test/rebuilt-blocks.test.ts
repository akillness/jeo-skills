// @vitest-environment jsdom
// The blocks under what apps rebuild most: long lists, grids, cells edited in
// place, logs that follow their end, items moved between lists, 2D values and
// undo. Through the public entry only; `bind` from the kernel stands in for
// an adapter.
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createArea,
  createGridFocus,
  createUndoStack,
  createInlineEdit,
  createStickToBottom,
  createTransfer,
  createVirtualizer,
  definePrimitive,
  bindDragPreview,
  matchesShortcut,
  transferMessage,
  type AreaReason,
  type AreaValue,
  type GridCell,
  type TransferDraft,
  type TransferLists,
} from "../src/index"
import { bind } from "../src/foundation/kernel/part"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

const key = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", {
    key,
    cancelable: true,
    bubbles: true,
    ...init,
  })

const pointer = (type: string, clientX: number, clientY: number) =>
  new PointerEvent(type, {
    clientX,
    clientY,
    button: 0,
    isPrimary: true,
    bubbles: true,
    cancelable: true,
  })

// Pointer moves land once a frame.
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

// An element at a fixed place, as jsdom has no layout.
function rectBox(
  left: number,
  top: number,
  width: number,
  height: number,
  parent: Element = document.body
) {
  const el = document.createElement("div")
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }) as DOMRect
  parent.append(el)
  return el
}

// A scroller of a fixed size whose scroll position can be set, as jsdom has no layout.
function scroller(height: number, contentHeight: () => number) {
  const el = document.createElement("div")
  let top = 0
  Object.defineProperties(el, {
    clientHeight: { get: () => height },
    clientWidth: { get: () => 300 },
    scrollHeight: { get: () => Math.max(height, contentHeight()) },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(
          0,
          Math.min(value, Math.max(0, contentHeight() - height))
        )
      },
    },
  })
  el.scrollTo = ((options: ScrollToOptions) => {
    el.scrollTop = options.top ?? top
  }) as typeof el.scrollTo
  document.body.append(el)
  return el
}

describe("createVirtualizer", () => {
  test("renders only the rows in view and the overscan, in a box as tall as every row", () => {
    const rows = createVirtualizer({
      count: () => 1000,
      estimate: () => 20,
      overscan: 2,
    })
    const el = scroller(100, () => rows.size())
    cleanups.push(rows.connect(el))
    expect(rows.size()).toBe(20000)
    // Five rows show, and two more past the bottom.
    expect(rows.items().map((item) => item.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
    el.scrollTop = 1000
    el.dispatchEvent(new Event("scroll"))
    const indexes = rows.items().map((item) => item.index)
    expect(indexes[0]).toBe(48)
    expect(indexes.at(-1)).toBe(56)
    expect(rows.items()[2]).toMatchObject({ index: 50, start: 1000, size: 20 })
  })

  test("items keeps its identity until something changes, and subscribers hear changes", () => {
    const rows = createVirtualizer({ count: () => 100, estimate: () => 20 })
    const el = scroller(100, () => rows.size())
    cleanups.push(rows.connect(el))
    const listener = vi.fn()
    rows.subscribe(listener)
    const first = rows.items()
    expect(rows.items()).toBe(first)
    el.scrollTop = 400
    el.dispatchEvent(new Event("scroll"))
    expect(listener).toHaveBeenCalled()
    expect(rows.items()).not.toBe(first)
  })

  test("a measured row moves every row after it, and keeps its size by key", () => {
    const keys = ["a", "b", "c", "d"]
    const rows = createVirtualizer({
      count: () => keys.length,
      estimate: () => 20,
      key: (i) => keys[i],
    })
    const el = scroller(200, () => rows.size())
    cleanups.push(rows.connect(el))
    const row = document.createElement("div")
    row.getBoundingClientRect = () => ({ height: 50, width: 300 }) as DOMRect
    cleanups.push(rows.measure(1, row))
    expect(rows.items().map((item) => item.start)).toEqual([0, 20, 70, 90])
    expect(rows.size()).toBe(110)
    // "b" sorts first; its size goes with it.
    keys.reverse()
    rows.refresh()
    expect(rows.items().find((item) => item.key === "b")).toMatchObject({
      index: 2,
      size: 50,
    })
  })

  test("keep renders a row out of view, and scrollToIndex brings one in", () => {
    const rows = createVirtualizer({
      count: () => 1000,
      estimate: () => 20,
      overscan: 0,
      keep: () => [500],
    })
    const el = scroller(100, () => rows.size())
    cleanups.push(rows.connect(el))
    expect(rows.items().map((item) => item.index)).toContain(500)
    rows.scrollToIndex(900)
    expect(el.scrollTop).toBe(900 * 20 + 20 - 100)
    rows.scrollToIndex(10, { align: "start" })
    expect(el.scrollTop).toBe(200)
  })

  test("scrollToIndex puts a row below scrollMargin, as under a sticky header", () => {
    const rows = createVirtualizer({
      count: () => 1000,
      estimate: () => 20,
      scrollMargin: 40,
    })
    const el = scroller(100, () => rows.size() + 40)
    cleanups.push(rows.connect(el))
    rows.scrollToIndex(10, { align: "start" })
    expect(el.scrollTop).toBe(200)
    // The middle of what shows under the header: 40 to 100.
    rows.scrollToIndex(20, { align: "center" })
    expect(el.scrollTop).toBe(40 + 400 + 10 - 70)
    rows.scrollToIndex(30, { align: "end" })
    expect(el.scrollTop).toBe(40 + 600 + 20 - 100)
  })

  test("onEnd asks for more once per count as the end comes near", async () => {
    let count = 30
    const onEnd = vi.fn(() => (count += 30))
    const rows = createVirtualizer({
      count: () => count,
      estimate: () => 20,
      onEnd,
      endThreshold: 5,
    })
    const el = scroller(100, () => rows.size())
    cleanups.push(rows.connect(el))
    el.scrollTop = 400
    el.dispatchEvent(new Event("scroll"))
    await Promise.resolve()
    expect(onEnd).toHaveBeenCalledTimes(1)
    el.dispatchEvent(new Event("scroll"))
    await Promise.resolve()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})

describe("createGridFocus", () => {
  type GridState = { active: GridCell | null }
  const grid = definePrimitive({
    name: "grid",
    options: { disabled: "value" },
    state: (_options: {
      disabled?: (cell: GridCell) => boolean
    }): GridState => ({ active: null }),
    api: (context) => {
      const reveal = vi.fn()
      const moves: { cell: GridCell; shift: boolean }[] = []
      const focus = createGridFocus<GridState>(context, {
        key: "active",
        rows: () => 100,
        cols: () => 4,
        pageSize: () => 10,
        disabled: (cell) => context.options().disabled?.(cell) ?? false,
        reveal,
        onMove: (cell, { shift }) => moves.push({ cell, shift }),
      })
      return { focus, reveal, moves }
    },
    slots: (slot) => ({
      cell: slot<{ row: number; col: number }>({
        props: { row: "number", col: "number" },
      }),
    }),
  })

  test("the first cell has the tab stop, then arrows, Home, End and pages move it", () => {
    const instance = grid({ id: "g" })
    cleanups.push(() => instance.destroy())
    const { focus } = instance.api
    expect(focus.tabIndex(instance.get(), { row: 0, col: 0 })).toBe("0")
    expect(focus.tabIndex(instance.get(), { row: 0, col: 1 })).toBe("-1")
    focus.keydown(key("ArrowRight"))
    expect(instance.get().active).toEqual({ row: 0, col: 1 })
    focus.keydown(key("End"))
    expect(instance.get().active).toEqual({ row: 0, col: 3 })
    focus.keydown(key("PageDown"))
    expect(instance.get().active).toEqual({ row: 10, col: 3 })
    focus.keydown(key("End", { ctrlKey: true }))
    expect(instance.get().active).toEqual({ row: 99, col: 3 })
    focus.keydown(key("Home", { ctrlKey: true }))
    expect(instance.get().active).toEqual({ row: 0, col: 0 })
    focus.keydown(key("ArrowUp"))
    expect(instance.get().active).toEqual({ row: 0, col: 0 })
  })

  test("Command on a Mac is Control, for Home and End", () => {
    const instance = grid({ id: "g" })
    cleanups.push(() => instance.destroy())
    const { focus } = instance.api
    focus.focus({ row: 5, col: 2 })
    expect(focus.keydown(key("End", { metaKey: true }))).toBe(true)
    expect(instance.get().active).toEqual({ row: 99, col: 3 })
    expect(focus.keydown(key("Home", { metaKey: true }))).toBe(true)
    expect(instance.get().active).toEqual({ row: 0, col: 0 })
  })

  test("before the grid is entered, the first cell that isn't disabled has the tab stop and keys start there", () => {
    const instance = grid({
      id: "g",
      disabled: (cell) => cell.row === 0 && cell.col === 0,
    })
    cleanups.push(() => instance.destroy())
    const { focus } = instance.api
    expect(focus.tabIndex(instance.get(), { row: 0, col: 0 })).toBe("-1")
    expect(focus.tabIndex(instance.get(), { row: 0, col: 1 })).toBe("0")
    expect(focus.keydown(key("ArrowLeft"))).toBe(true)
    expect(instance.get().active).toEqual({ row: 0, col: 1 })
    const fresh = grid({
      id: "h",
      disabled: (cell) => cell.row === 0 && cell.col === 0,
    })
    cleanups.push(() => fresh.destroy())
    expect(fresh.api.focus.keydown(key("ArrowRight"))).toBe(true)
    expect(fresh.get().active).toEqual({ row: 0, col: 2 })
  })

  test("a first row of disabled cells passes the tab stop to the next row, and follows new options", () => {
    const instance = grid({ id: "g", disabled: (cell) => cell.row === 0 })
    cleanups.push(() => instance.destroy())
    const { focus } = instance.api
    expect(focus.tabIndex(instance.get(), { row: 0, col: 0 })).toBe("-1")
    expect(focus.tabIndex(instance.get(), { row: 1, col: 0 })).toBe("0")
    instance.setOptions({
      id: "g",
      disabled: (cell) => cell.row < 2 && cell.col < 3,
    })
    expect(focus.tabIndex(instance.get(), { row: 1, col: 0 })).toBe("-1")
    expect(focus.tabIndex(instance.get(), { row: 0, col: 3 })).toBe("0")
    expect(focus.keydown(key("ArrowDown"))).toBe(true)
    expect(instance.get().active).toEqual({ row: 1, col: 3 })
  })

  test("the tab stop is found once for all the cells, not once per cell", () => {
    const disabled = vi.fn((cell: GridCell) => cell.row < 50)
    const instance = grid({ id: "g", disabled })
    cleanups.push(() => instance.destroy())
    const stops: string[] = []
    for (let row = 0; row < 100; row++) {
      for (let col = 0; col < 4; col++) {
        if (instance.api.focus.tabIndex(instance.get(), { row, col }) === "0") {
          stops.push(`${row}:${col}`)
        }
      }
    }
    expect(stops).toEqual(["50:0"])
    expect(disabled.mock.calls.length).toBeLessThanOrEqual(400)
  })

  test("skips disabled cells, reveals the target and reports Shift", () => {
    const instance = grid({ id: "g", disabled: (cell) => cell.row === 1 })
    cleanups.push(() => instance.destroy())
    const { focus, reveal, moves } = instance.api
    focus.focus({ row: 0, col: 2 })
    focus.keydown(key("ArrowDown", { shiftKey: true }))
    expect(instance.get().active).toEqual({ row: 2, col: 2 })
    expect(reveal).toHaveBeenLastCalledWith({ row: 2, col: 2 })
    expect(moves.at(-1)).toEqual({ cell: { row: 2, col: 2 }, shift: true })
  })

  test("focus lands on a cell that binds after it was moved to", async () => {
    const instance = grid({ id: "g" })
    cleanups.push(() => instance.destroy())
    instance.api.focus.focus({ row: 50, col: 1 })
    const el = document.createElement("div")
    el.tabIndex = -1
    document.body.append(el)
    cleanups.push(instance.api.focus.bind(el, { row: 50, col: 1 }))
    await Promise.resolve()
    expect(document.activeElement).toBe(el)
  })
})

describe("createInlineEdit", () => {
  type EditState = { editing: string | null; values: Record<string, string> }
  const table = definePrimitive({
    name: "table",
    options: { valid: "value" },
    state: (_options: { valid?: (text: string) => boolean }): EditState => ({
      editing: null,
      values: { a: "Alpha", b: "Beta" },
    }),
    api: (context) => {
      const edit = createInlineEdit<EditState>(context, {
        key: "editing",
        value: (id) => context.store.get().values[id],
        commit: (id, text) => {
          if (context.options().valid && !context.options().valid!(text)) {
            return false
          }
          context.store.set({
            values: { ...context.store.get().values, [id]: text },
          })
          return true
        },
      })
      return { edit }
    },
    slots: (slot) => ({
      cell: slot<{ value: string }>({ props: { value: "string" } }),
    }),
  })

  function mount(options: { valid?: (text: string) => boolean } = {}) {
    const instance = table({ id: "t", ...options })
    cleanups.push(() => instance.destroy())
    const cell = document.createElement("div")
    cell.tabIndex = 0
    const input = document.createElement("input")
    document.body.append(cell, input)
    cell.focus()
    return { instance, cell, input }
  }

  test("Enter starts with the text selected, Enter saves and focus goes back", async () => {
    const { instance, cell, input } = mount()
    const { edit } = instance.api
    expect(edit.keydown(key("Enter"), "a")).toBe(true)
    expect(edit.editing(instance.get())).toBe("a")
    edit.bindInput(input)
    expect(input.value).toBe("Alpha")
    expect(document.activeElement).toBe(input)
    input.value = "Alpha 2"
    edit.inputKeydown(key("Enter"))
    expect(instance.get().values.a).toBe("Alpha 2")
    expect(instance.get().editing).toBeNull()
    // The adapter takes the input out once editing ends.
    input.remove()
    await Promise.resolve()
    expect(document.activeElement).toBe(cell)
  })

  test("an Enter that confirms an input method's text doesn't save, even Safari's", () => {
    const { instance, input } = mount()
    const { edit } = instance.api
    edit.keydown(key("Enter"), "a")
    edit.bindInput(input)
    input.value = "東京"
    expect(edit.inputKeydown(key("Enter", { isComposing: true }))).toBe(false)
    // Safari ends the composition first, so its Enter says it isn't composing and has key code 229.
    expect(edit.inputKeydown(key("Enter", { keyCode: 229 }))).toBe(false)
    expect(instance.get().editing).toBe("a")
    edit.inputKeydown(key("Enter"))
    expect(instance.get().values.a).toBe("東京")
  })

  test("typing starts over with the character, and Escape puts the text back", () => {
    const { instance, input } = mount()
    const { edit } = instance.api
    edit.keydown(key("x"), "b")
    edit.bindInput(input)
    expect(input.value).toBe("x")
    edit.inputKeydown(key("Escape"))
    expect(instance.get().values.b).toBe("Beta")
    expect(instance.get().editing).toBeNull()
  })

  test("text that doesn't save keeps editing", () => {
    const { instance, input } = mount({ valid: (text) => text.length > 0 })
    const { edit } = instance.api
    edit.start("a")
    edit.bindInput(input)
    input.value = ""
    expect(edit.end("enter-key")).toBe(false)
    expect(instance.get().editing).toBe("a")
  })

  // A row whose Rename button is swapped for the input, as a menu item that closes would be.
  function renameFromRow() {
    const instance = table({ id: "t" })
    cleanups.push(() => instance.destroy())
    const row = document.createElement("div")
    row.tabIndex = -1
    const rename = document.createElement("button")
    row.append(rename)
    document.body.append(row)
    const start = () => {
      rename.focus()
      instance.api.edit.start("a")
      const input = document.createElement("input")
      row.replaceChildren(input)
      instance.api.edit.bindInput(input)
      return input
    }
    return { instance, row, start }
  }

  test.each(["Enter", "Escape"])(
    "%s after the button that started editing left goes to the focusable element around the input",
    async (pressed) => {
      const { instance, row, start } = renameFromRow()
      const input = start()
      input.value = "Alpha 2"
      instance.api.edit.inputKeydown(key(pressed))
      expect(instance.get().editing).toBeNull()
      input.remove()
      await Promise.resolve()
      expect(document.activeElement).toBe(row)
    }
  )

  test("focus moved on purpose stays put when the button that started editing left", async () => {
    const { instance, start } = renameFromRow()
    const next = document.createElement("button")
    document.body.append(next)
    const input = start()
    expect(instance.api.edit.inputKeydown(key("Tab"))).toBe(true)
    next.focus()
    input.remove()
    await Promise.resolve()
    expect(document.activeElement).toBe(next)
  })
})

describe("createStickToBottom", () => {
  test("starts at the end, stops following when scrolled up, and follows again from scrollToBottom", () => {
    const el = scroller(100, () => 500)
    const log = createStickToBottom()
    cleanups.push(log.connect(el))
    expect(el.scrollTop).toBe(400)
    // The reader scrolls up.
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -50 }))
    el.scrollTop = 200
    el.dispatchEvent(new Event("scroll"))
    expect(log.get()).toMatchObject({ following: false, atBottom: false })
    log.scrollToBottom()
    expect(log.get().following).toBe(true)
    expect(el.scrollTop).toBe(400)
  })

  test("content that pushes the end out of view while not following is unseen", async () => {
    let content = 500
    const el = scroller(100, () => content)
    const log = createStickToBottom()
    cleanups.push(log.connect(el))
    log.release()
    expect(log.get()).toMatchObject({
      following: false,
      atBottom: true,
      unseen: false,
    })
    content = 600
    el.append(document.createElement("p"))
    await Promise.resolve()
    expect(log.get()).toMatchObject({ atBottom: false, unseen: true })
  })

  test("rows removed or added above keep the rows in view still while not following", async () => {
    const el = scroller(100, () => el.children.length * 50)
    el.getBoundingClientRect = () => new DOMRect(0, 0, 300, 100)
    const row = () => {
      const p = document.createElement("p")
      p.getBoundingClientRect = () => {
        const top = [...el.children].indexOf(p) * 50 - el.scrollTop
        return new DOMRect(0, top, 300, 50)
      }
      p.getClientRects = () =>
        [p.getBoundingClientRect()] as unknown as DOMRectList
      return p
    }
    for (let i = 0; i < 10; i++) {
      el.append(row())
    }
    const log = createStickToBottom()
    cleanups.push(log.connect(el))
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -50 }))
    el.scrollTop = 220
    el.dispatchEvent(new Event("scroll"))
    const first = el.children[4]
    el.children[0].remove()
    el.children[0].remove()
    el.append(row())
    await Promise.resolve()
    expect(el.scrollTop).toBe(120)
    expect(first.getBoundingClientRect().top).toBe(-20)
    expect(log.get()).toMatchObject({ following: false, unseen: true })
    el.prepend(row())
    await Promise.resolve()
    expect(first.getBoundingClientRect().top).toBe(-20)
    expect(log.get().unseen).toBe(true)
    // The page's own scroll as a row arrives stays where it went.
    el.scrollTop = 50
    el.append(row())
    await Promise.resolve()
    expect(el.scrollTop).toBe(50)
    // Near the end, rows going above pull the scroll position back first.
    el.scrollTop = 370
    el.dispatchEvent(new Event("scroll"))
    const last = el.children[8]
    el.children[0].remove()
    el.children[0].remove()
    // The browser clamps to the shorter content.
    el.scrollTop = el.scrollTop
    expect(el.scrollTop).toBe(350)
    await Promise.resolve()
    expect(el.scrollTop).toBe(270)
    expect(last.getBoundingClientRect().top).toBe(30)
  })

  test("rows in a wrapper, like Scroll Area's content, stay still when rows above them go", async () => {
    const content = document.createElement("div")
    const el = scroller(100, () => content.children.length * 50)
    el.append(content)
    el.getBoundingClientRect = () => new DOMRect(0, 0, 300, 100)
    const row = () => {
      const p = document.createElement("p")
      p.getBoundingClientRect = () => {
        const top = [...content.children].indexOf(p) * 50 - el.scrollTop
        return new DOMRect(0, top, 300, 50)
      }
      p.getClientRects = () =>
        [p.getBoundingClientRect()] as unknown as DOMRectList
      return p
    }
    for (let i = 0; i < 10; i++) {
      content.append(row())
    }
    const log = createStickToBottom()
    cleanups.push(log.connect(el))
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -50 }))
    el.scrollTop = 220
    el.dispatchEvent(new Event("scroll"))
    const first = content.children[4]
    content.children[0].remove()
    content.children[0].remove()
    content.append(row())
    await Promise.resolve()
    expect(el.scrollTop).toBe(120)
    expect(first.getBoundingClientRect().top).toBe(-20)
    expect(log.get()).toMatchObject({ following: false, unseen: true })
  })

  test("one row alone stays still when a row goes in above it", async () => {
    const el = scroller(100, () => el.children.length * 300)
    el.getBoundingClientRect = () => new DOMRect(0, 0, 300, 100)
    const row = () => {
      const p = document.createElement("p")
      p.textContent = "A long message"
      p.getBoundingClientRect = () => {
        const top = [...el.children].indexOf(p) * 300 - el.scrollTop
        return new DOMRect(0, top, 300, 300)
      }
      p.getClientRects = () =>
        [p.getBoundingClientRect()] as unknown as DOMRectList
      return p
    }
    const first = row()
    el.append(first)
    const log = createStickToBottom()
    cleanups.push(log.connect(el))
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -50 }))
    el.scrollTop = 100
    el.dispatchEvent(new Event("scroll"))
    el.prepend(row())
    await Promise.resolve()
    expect(first.getBoundingClientRect().top).toBe(-100)
  })

  test("prepend keeps the distance from the end", () => {
    let content = 500
    const el = scroller(100, () => content)
    const log = createStickToBottom({ initial: false })
    cleanups.push(log.connect(el))
    el.scrollTop = 100
    el.dispatchEvent(new Event("scroll"))
    log.prepend()
    content = 800
    // Older messages arrive as children; the mutation observer reads the new height.
    el.append(document.createElement("p"))
    return Promise.resolve().then(() => {
      expect(el.scrollTop).toBe(400)
    })
  })
})

describe("createTransfer", () => {
  type BoardState = { lists: TransferLists; moving: TransferDraft | null }
  const board = definePrimitive({
    name: "kanban",
    options: { lists: "value", limit: "number" },
    state: (options: { lists: TransferLists; limit?: number }): BoardState => ({
      lists: options.lists,
      moving: null,
    }),
    sync: (options) => ({ lists: options.lists }),
    api: (context) => {
      const set = vi.fn((value: TransferLists, _details: object) => {
        context.store.set({ lists: value })
        return true
      })
      const transfer = createTransfer<BoardState>(context, {
        key: "lists",
        draft: "moving",
        set,
        accepts: (_key, list) => {
          const limit = context.options().limit
          return (
            limit === undefined ||
            context.store.get().lists[list].length < limit
          )
        },
      })
      return { transfer, set }
    },
    slots: (slot) => ({
      card: slot<{ value: string }>({ props: { value: "string" } }),
    }),
  })

  test("Space picks up, arrows move within and across lists, Space drops in one change", () => {
    const instance = board({
      id: "k",
      lists: { todo: ["a", "b"], doing: ["c"], done: [] },
    })
    cleanups.push(() => instance.destroy())
    const { transfer, set } = instance.api
    transfer.keydown(key(" "), "a")
    expect(instance.get().moving).toMatchObject({ key: "a", from: "todo" })
    transfer.keydown(key("ArrowDown"), "a")
    expect(transfer.lists(instance.get()).todo).toEqual(["b", "a"])
    transfer.keydown(key("ArrowRight"), "a")
    expect(transfer.lists(instance.get())).toEqual({
      todo: ["b"],
      doing: ["c", "a"],
      done: [],
    })
    transfer.keydown(key("ArrowRight"), "a")
    expect(transfer.lists(instance.get()).done).toEqual(["a"])
    expect(set).not.toHaveBeenCalled()
    transfer.keydown(key(" "), "a")
    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][1]).toMatchObject({
      key: "a",
      from: "todo",
      to: "done",
      index: 0,
      reason: "move-key",
    })
    expect(instance.get().lists).toEqual({
      todo: ["b"],
      doing: ["c"],
      done: ["a"],
    })
  })

  test("focus on a card's handle follows the card into another list, where a framework renders it as a new element", async () => {
    const instance = board({ id: "k", lists: { todo: ["a"], doing: [] } })
    cleanups.push(() => instance.destroy())
    const { transfer } = instance.api
    const render = (badge = false) => {
      const card = document.body.appendChild(document.createElement("div"))
      if (badge) {
        card.appendChild(document.createElement("span")).textContent = "Doing"
      }
      const title = card.appendChild(document.createElement("span"))
      title.textContent = "Card"
      const handle = card.appendChild(document.createElement("button"))
      const unbind = transfer.bindItem(card, "a")
      return { card, handle, unbind }
    }
    const first = render()
    first.handle.focus()
    transfer.keydown(key(" "), "a")
    transfer.keydown(key("ArrowRight"), "a")
    first.unbind()
    first.card.remove()
    const second = render(true)
    await new Promise((resolve) => setTimeout(resolve))
    expect(document.activeElement).toBe(second.handle)
  })

  test("Escape puts it back, and a full list is skipped", () => {
    const instance = board({
      id: "k",
      lists: { todo: ["a"], doing: ["c"], done: [] },
      limit: 1,
    })
    cleanups.push(() => instance.destroy())
    const { transfer, set } = instance.api
    transfer.keydown(key("Enter"), "a")
    transfer.keydown(key("ArrowRight"), "a")
    // Doing is full, so it goes on to Done.
    expect(transfer.lists(instance.get()).done).toEqual(["a"])
    transfer.keydown(key("Escape"), "a")
    expect(instance.get().moving).toBeNull()
    expect(instance.get().lists.todo).toEqual(["a"])
    expect(set).not.toHaveBeenCalled()
  })

  test("lists the owner changes mid-move stay changed, with the moved item where the user put it", () => {
    const instance = board({ id: "k", lists: { todo: ["a", "b"], done: [] } })
    cleanups.push(() => instance.destroy())
    const { transfer, set } = instance.api
    transfer.grab("a")
    instance.setOptions({ id: "k", lists: { todo: ["a", "b"], done: ["c"] } })
    transfer.drop()
    expect(set).not.toHaveBeenCalled()
    transfer.grab("a")
    transfer.moveTo("done", 0)
    instance.setOptions({
      id: "k",
      lists: { todo: ["a", "b", "z"], done: ["c"] },
    })
    transfer.drop()
    expect(set.mock.calls[0][0]).toEqual({ todo: ["b", "z"], done: ["a", "c"] })
  })

  test("an item the owner deletes mid-move ends the move", () => {
    const instance = board({ id: "k", lists: { todo: ["a", "b"], done: [] } })
    cleanups.push(() => instance.destroy())
    const { transfer, set } = instance.api
    transfer.grab("a")
    transfer.moveTo("done", 0)
    instance.setOptions({ id: "k", lists: { todo: ["b"], done: [] } })
    expect(instance.get().moving).toBeNull()
    transfer.drop()
    expect(set).not.toHaveBeenCalled()
  })

  test("a list the owner fills mid-move ends the move into it", () => {
    const instance = board({
      id: "k",
      lists: { todo: ["a", "b"], done: [] },
      limit: 1,
    })
    cleanups.push(() => instance.destroy())
    const { transfer, set } = instance.api
    transfer.grab("a")
    transfer.moveTo("done", 0)
    instance.setOptions({
      id: "k",
      lists: { todo: ["a", "b"], done: ["c"] },
      limit: 1,
    })
    expect(instance.get().moving).toBeNull()
    transfer.drop()
    expect(set).not.toHaveBeenCalled()
  })

  test("move commits at once, and the messages name the list", () => {
    const instance = board({ id: "k", lists: { todo: ["a"], done: [] } })
    cleanups.push(() => instance.destroy())
    expect(instance.api.transfer.move("a", "done", 0)).toBe(true)
    expect(instance.get().lists).toEqual({ todo: [], done: ["a"] })
    expect(
      transferMessage({
        type: "drop",
        key: "a",
        label: "Write tests",
        list: "Done",
        position: 1,
        total: 3,
      })
    ).toBe("Dropped Write tests in Done, position 1 of 3.")
  })

  test("a pointer drag shows a copy over the page, moves the item between lists, and drops once", async () => {
    const instance = board({
      id: "k",
      lists: { todo: ["a", "b"], doing: ["c"] },
    })
    cleanups.push(() => instance.destroy())
    const { transfer, set } = instance.api
    const todo = rectBox(0, 0, 100, 200)
    const doing = rectBox(120, 0, 100, 200)
    cleanups.push(
      transfer.bindList(todo, "todo"),
      transfer.bindList(doing, "doing")
    )
    const cards = {
      a: rectBox(0, 0, 100, 40, todo),
      b: rectBox(0, 50, 100, 40, todo),
      c: rectBox(120, 0, 100, 40, doing),
    }
    cards.a.id = "card-a"
    for (const [value, el] of Object.entries(cards)) {
      cleanups.push(transfer.bindItem(el, value))
    }

    // Nothing under the pointer scrolls, as jsdom has no layout.
    document.elementsFromPoint = () => []
    cleanups.push(
      () => delete (document as Partial<Document>).elementsFromPoint
    )
    transfer.pointerdown(pointer("pointerdown", 50, 20), "a")
    document.dispatchEvent(pointer("pointermove", 60, 20))
    await frame()
    const preview = document.querySelector<HTMLElement>("[data-drag-preview]")!
    expect(preview).not.toBeNull()
    expect(preview.id).toBe("")
    // The copy follows the pointer while the item waits where it would drop.
    document.dispatchEvent(pointer("pointermove", 170, 60))
    await frame()
    expect(preview.style.translate).toBe("120px 40px")
    expect(transfer.lists(instance.get())).toEqual({
      todo: ["b"],
      doing: ["c", "a"],
    })
    expect(set).not.toHaveBeenCalled()

    document.dispatchEvent(pointer("pointerup", 170, 60))
    expect(document.querySelector("[data-drag-preview]")).toBeNull()
    expect(set).toHaveBeenCalledTimes(1)
    expect(instance.get().lists).toEqual({ todo: ["b"], doing: ["c", "a"] })
  })
})

describe("bindDragPreview", () => {
  test("copies the element without ids, hidden from screen readers and the pointer, and follows it", () => {
    const el = rectBox(10, 20, 100, 40)
    el.id = "card"
    el.innerHTML = '<span id="title">Card</span>'
    el.tabIndex = 0
    el.style.color = "rgb(255, 0, 0)"
    const preview = bindDragPreview(el, { x: 15, y: 25 })
    const copy = preview.el
    expect(copy.isConnected).toBe(true)
    expect(copy.textContent).toBe("Card")
    expect(copy.querySelector("[id]")).toBeNull()
    expect(copy.hasAttribute("id")).toBe(false)
    expect(copy.getAttribute("aria-hidden")).toBe("true")
    expect(copy.hasAttribute("data-drag-preview")).toBe(true)
    expect(copy.hasAttribute("tabindex")).toBe(false)
    expect(copy.inert).toBe(true)
    expect(copy.style).toMatchObject({
      position: "fixed",
      left: "10px",
      top: "20px",
      width: "100px",
      height: "40px",
      pointerEvents: "none",
      color: "rgb(255, 0, 0)",
    })
    // The element stays where it was.
    expect(el.isConnected).toBe(true)

    preview.move(45, 35)
    expect(copy.style.translate).toBe("30px 10px")
    preview.remove()
    expect(copy.isConnected).toBe(false)
  })

  test("leaves a checked radio in the element checked, and shows it checked in the copy", () => {
    const el = rectBox(10, 20, 100, 40)
    el.innerHTML =
      '<input type="radio" name="default" value="a" checked> Card A'
    const other = rectBox(10, 60, 100, 40)
    other.innerHTML = '<input type="radio" name="default" value="b"> Card B'
    const radio = el.querySelector("input")!
    const preview = bindDragPreview(el, { x: 15, y: 25 })
    expect(preview.el.querySelector("input")!.checked).toBe(true)
    expect(radio.checked).toBe(true)
    preview.remove()
    expect(radio.checked).toBe(true)
  })

  test("takes the copy out of named details groups, its own root and any inside, and keeps them open", () => {
    const el = document.createElement("details")
    el.setAttribute("name", "faq")
    el.open = true
    el.innerHTML =
      '<summary>Card A</summary><details name="more" open><summary>More</summary></details>'
    el.getBoundingClientRect = () => new DOMRect(10, 20, 100, 40)
    document.body.append(el)
    const preview = bindDragPreview(el, { x: 15, y: 25 })
    const copies = [
      preview.el,
      ...preview.el.querySelectorAll("details"),
    ] as HTMLDetailsElement[]
    expect(
      copies.map((copy) => [copy.getAttribute("name"), copy.open])
    ).toEqual([
      [null, true],
      [null, true],
    ])
    expect([el.open, el.querySelector("details")!.open]).toEqual([true, true])
    preview.remove()
    el.remove()
  })

  test("takes a radio inside a label out of its group in the copy only", () => {
    const el = rectBox(10, 20, 100, 40)
    el.innerHTML =
      '<label><input type="radio" name="default" value="a" checked> Card A</label>'
    const preview = bindDragPreview(el, { x: 15, y: 25 })
    expect(preview.el.querySelector("input")!.hasAttribute("name")).toBe(false)
    expect(el.querySelector("input")!.getAttribute("name")).toBe("default")
    preview.remove()
  })

  test("keeps other names in the copy, like an icon's", () => {
    const el = rectBox(10, 20, 100, 40)
    el.innerHTML =
      '<ui-icon name="grip"></ui-icon><input name="title" value="Card A">'
    const preview = bindDragPreview(el, { x: 15, y: 25 })
    expect(preview.el.querySelector("ui-icon")!.getAttribute("name")).toBe(
      "grip"
    )
    expect(preview.el.querySelector("input")!.getAttribute("name")).toBe(
      "title"
    )
    preview.remove()
  })
})

describe("createArea", () => {
  type PadState = { value: AreaValue }
  const pad = definePrimitive({
    name: "pad",
    state: (): PadState => ({ value: { x: 0.5, y: 0.5 } }),
    api: (context) => {
      const changes: AreaReason[] = []
      const commits: AreaReason[] = []
      const area = createArea<PadState>(context, {
        value: (state) => state.value,
        set: (value, { reason }) => {
          changes.push(reason)
          context.store.set({ value })
          return true
        },
        onCommit: (_value, { reason }) => commits.push(reason),
        x: () => ({ step: 0.1, label: "Saturation" }),
        y: () => ({ step: 0.1, label: "Brightness" }),
      })
      return { area, changes, commits }
    },
    slots: (slot) => ({ area: slot({}) }),
  })

  test("arrows step each axis without float noise, Shift ten steps, clamped", () => {
    const instance = pad({ id: "p" })
    cleanups.push(() => instance.destroy())
    const { area } = instance.api
    area.keydown(key("ArrowRight"))
    area.keydown(key("ArrowUp"))
    area.keydown(key("ArrowUp"))
    expect(instance.get().value).toEqual({ x: 0.6, y: 0.7 })
    area.keydown(key("ArrowDown", { shiftKey: true }))
    expect(instance.get().value.y).toBe(0)
    area.keydown(key("End"))
    expect(instance.get().value.x).toBe(1)
  })

  test("a press jumps to the point, with y from the bottom, and the thumb names both axes", () => {
    const instance = pad({ id: "p" })
    cleanups.push(() => instance.destroy())
    const surface = document.createElement("div")
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    document.body.append(surface)
    cleanups.push(bind(instance.part("area", {}), surface))
    instance.api.area.pointerdown(
      new PointerEvent("pointerdown", { clientX: 50, clientY: 20, button: 0 }),
      surface
    )
    expect(instance.get().value).toEqual({ x: 0.3, y: 0.8 })
    expect(instance.api.area.thumbAttrs(instance.get())).toMatchObject({
      role: "slider",
      "aria-valuetext": "Saturation 30%, Brightness 80%",
    })
    expect(instance.api.area.thumbStyle(instance.get())).toContain("top:20")
  })

  test("reports a press as track-press, a drag as drag and a key as step-key, like a slider", async () => {
    const instance = pad({ id: "p" })
    cleanups.push(() => instance.destroy())
    const surface = rectBox(0, 0, 200, 100)
    const { area, changes, commits } = instance.api
    area.pointerdown(pointer("pointerdown", 50, 20), surface)
    document.dispatchEvent(pointer("pointerup", 50, 20))
    area.pointerdown(pointer("pointerdown", 50, 20), surface)
    document.dispatchEvent(pointer("pointermove", 150, 80))
    await frame()
    document.dispatchEvent(pointer("pointerup", 150, 80))
    area.keydown(key("ArrowRight"))
    expect(changes).toEqual(["track-press", "drag", "step-key"])
    expect(commits).toEqual(["track-press", "drag", "step-key"])
  })
})

describe("createUndoStack", () => {
  test("undo and redo walk the recorded states, and mod+z matches per platform", () => {
    const stack = createUndoStack({ a: 1 })
    stack.record({ a: 2 })
    stack.record({ a: 3 })
    expect(stack.undo()).toEqual({ a: 2 })
    expect(stack.redo()).toEqual({ a: 3 })
    expect(stack.canRedo()).toBe(false)
    expect(matchesShortcut(key("z", { metaKey: true }), "mod+z", true)).toBe(
      true
    )
    expect(matchesShortcut(key("z", { ctrlKey: true }), "mod+z", false)).toBe(
      true
    )
    expect(
      matchesShortcut(
        key("z", { ctrlKey: true, shiftKey: true }),
        "mod+z",
        false
      )
    ).toBe(false)
  })
})
