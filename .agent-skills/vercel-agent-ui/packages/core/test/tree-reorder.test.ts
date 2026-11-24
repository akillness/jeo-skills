// @vitest-environment jsdom
// `createTreeReorder` through the public entry: an outline whose rows render
// in the draft's order, one element per row on screen, as a framework would.
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createChange,
  createTreeReorder,
  definePrimitive,
  type ChangeDetails,
  type PrimitiveInstance,
  type TreeReorderDraft,
  type TreeReorderRow,
} from "../src/index"
import { bind } from "../src/foundation/kernel/part"
import {
  depthRange,
  movedRows,
  placeOf,
  subtreeEnd,
} from "../src/foundation/drag-and-drop/tree-reorder"

type Options = {
  rows?: TreeReorderRow[]
  defaultRows: TreeReorderRow[]
  onRowsChange?: (
    rows: TreeReorderRow[],
    details: ChangeDetails<"drag" | "move-key" | "imperative">
  ) => void
  maxDepth?: number
}
type State = { rows: TreeReorderRow[]; moving: TreeReorderDraft | null }

const outline = definePrimitive({
  name: "outline",
  options: {
    rows: "value",
    defaultRows: "value",
    onRowsChange: "callback",
    maxDepth: "number",
  },
  state: (options: Options): State => ({
    rows: options.rows ?? options.defaultRows,
    moving: null,
  }),
  sync: (options) => (options.rows === undefined ? {} : { rows: options.rows }),
  api: (context) => {
    const change = createChange(context)
    const tree = createTreeReorder<State>(context, {
      key: "rows",
      draft: "moving",
      set: (value, details) => change("rows", value, details),
      maxDepth: () => context.options().maxDepth ?? Infinity,
    })
    return { tree }
  },
  slots: (slot) => ({
    row: slot<{ value: string }>({
      props: { value: "string" },
      on: {
        keydown: (event, { api, key }) => api.tree.keydown(event, key),
        pointerdown: (event, { api, key }) => api.tree.pointerdown(event, key),
      },
      bind: (el, { api, key }) => api.tree.bind(el, key),
    }),
  }),
})

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const tick = () => new Promise((resolve) => setTimeout(resolve))
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

const rows = (text: string) =>
  text
    .trim()
    .split("\n")
    .map((line) => ({
      key: line.trim(),
      depth: (line.length - line.trimStart().length) / 2,
    }))

const outlineOf = (list: readonly TreeReorderRow[]) =>
  list.map((row) => `${"  ".repeat(row.depth)}${row.key}`).join("\n")

// Rows 20px tall, by their place among the rows on screen in the draft.
function render(options: Options, hidden: string[] = []) {
  const instance = outline({ id: "o", ...options }) as ReturnType<
    typeof outline
  > &
    PrimitiveInstance
  const els = new Map<string, HTMLElement>()
  for (const row of options.defaultRows) {
    if (hidden.includes(row.key)) {
      continue
    }
    const el = document.createElement("div")
    el.tabIndex = 0
    el.textContent = row.key
    document.body.append(el)
    cleanups.push(bind(instance.part("row", { value: row.key }), el))
    els.set(row.key, el)
  }
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const shown = instance.api.tree
        .rows(instance.get())
        .filter((row) => els.has(row.key))
      const top = shown.findIndex((row) => row.key === this.textContent) * 20
      return {
        top,
        left: 0,
        width: 200,
        height: 20,
        bottom: top + 20,
        right: 200,
      } as DOMRect
    }
  )
  const press = (key: string) =>
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    )
  const shown = () => outlineOf(instance.api.tree.rows(instance.get()))
  return { instance, els, press, shown }
}

const pointer = (
  type: string,
  init: { x?: number; y?: number; target?: EventTarget } = {}
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
    buttons: type === "pointerup" ? 0 : 1,
  })
  Object.assign(event, { pointerId: 1, isPrimary: true, pointerType: "mouse" })
  ;(init.target ?? document).dispatchEvent(event)
  return event
}

const notes = rows(`
inbox
projects
  site
    copy
  app
archive
`)

describe("the pure pieces", () => {
  test("subtreeEnd and placeOf read the outline", () => {
    expect(subtreeEnd(notes, 1)).toBe(5)
    expect(subtreeEnd(notes, 0)).toBe(1)
    expect(placeOf(notes, 4)).toEqual({ parent: 1, position: 1 })
    expect(placeOf(notes, 5)).toEqual({ parent: undefined, position: 2 })
  })

  test("depthRange keeps the row below with its parent", () => {
    expect(depthRange({ key: "a", depth: 1 }, { key: "b", depth: 0 })).toEqual({
      min: 0,
      max: 2,
    })
    expect(depthRange({ key: "a", depth: 1 }, { key: "b", depth: 2 })).toEqual({
      min: 2,
      max: 2,
    })
    expect(depthRange(undefined, { key: "b", depth: 0 })).toEqual({
      min: 0,
      max: 0,
    })
    expect(depthRange({ key: "a", depth: 3 }, undefined, 1)).toEqual({
      min: 0,
      max: 1,
    })
  })

  test("movedRows moves an item with its children, shifting their depths", () => {
    expect(outlineOf(movedRows(notes, "site", "inbox", 0))).toBe(
      outlineOf(
        rows(`
site
  copy
inbox
projects
  app
archive
`)
      )
    )
    expect(movedRows(notes, "app", "archive", 1)).toBe(notes)
  })
})

describe("createTreeReorder with the keyboard", () => {
  test("Up and Down move an item and its children between rows, and Space drops it in one change", async () => {
    const onRowsChange = vi.fn()
    const { instance, els, press, shown } = render({
      defaultRows: notes,
      onRowsChange,
    })
    els.get("site")!.focus()
    press(" ")
    expect(instance.get().moving?.keys).toEqual(["site", "copy"])
    press("ArrowDown")
    // Past app, still under projects.
    expect(shown()).toBe(
      outlineOf(
        rows(`
inbox
projects
  app
  site
    copy
archive
`)
      )
    )
    press(" ")
    expect(onRowsChange).toHaveBeenCalledTimes(1)
    expect(onRowsChange.mock.calls[0][1]).toMatchObject({
      reason: "move-key",
      key: "site",
      parent: "projects",
      index: 1,
    })
    await tick()
    expect(instance.get().moving).toBeNull()
  })

  test("Left and Right take an item out a level and in one, as far as the rows around it allow", () => {
    const { els, press, shown } = render({ defaultRows: notes })
    els.get("app")!.focus()
    press(" ")
    press("ArrowLeft")
    expect(shown()).toContain("projects\n  site\n    copy\napp\narchive")
    press("ArrowLeft")
    expect(shown()).toContain("\napp\narchive")
    press("ArrowRight")
    press("ArrowRight")
    press("ArrowRight")
    // After copy, as deep as a child of copy and no deeper.
    expect(shown()).toContain("    copy\n      app\narchive")
    press("Escape")
    expect(shown()).toBe(outlineOf(notes))
  })

  test("an item never takes another's children: above a deeper row it goes in as deep", () => {
    const { els, press, shown } = render({ defaultRows: notes })
    els.get("inbox")!.focus()
    press(" ")
    press("ArrowDown")
    expect(shown()).toContain("projects\n  inbox\n  site")
    press("ArrowDown")
    expect(shown()).toContain("  site\n    inbox\n    copy")
    press("ArrowLeft")
    expect(shown()).toContain("  site\n    inbox\n    copy")
    press("Escape")
  })

  test("moving through a deeper branch comes back out at the depth it aimed for", () => {
    const { els, press, shown } = render({ defaultRows: notes })
    els.get("inbox")!.focus()
    press(" ")
    for (let i = 0; i < 5; i++) {
      press("ArrowDown")
    }
    expect(shown()).toBe(
      outlineOf(
        rows(`
projects
  site
    copy
  app
archive
inbox
`)
      )
    )
  })

  test("rows inside a collapsed item are skipped, and dropping in one goes after its children", () => {
    const { els, press, shown } = render({ defaultRows: notes }, [
      "site",
      "copy",
      "app",
    ])
    els.get("inbox")!.focus()
    press(" ")
    press("ArrowDown")
    press("ArrowRight")
    expect(shown()).toBe(
      outlineOf(
        rows(`
projects
  site
    copy
  app
  inbox
archive
`)
      )
    )
  })

  test("maxDepth caps how deep an item goes", () => {
    const { els, press, shown } = render({ defaultRows: notes, maxDepth: 1 })
    els.get("archive")!.focus()
    press(" ")
    press("ArrowRight")
    press("ArrowRight")
    expect(shown()).toContain("  app\n  archive")
  })

  test("maxDepth counts the rows under an item too", () => {
    const { els, instance, press, shown } = render({
      defaultRows: notes,
      maxDepth: 2,
    })
    els.get("site")!.focus()
    press(" ")
    press("ArrowDown")
    press("ArrowRight")
    expect(shown()).toContain("  app\n  site\n    copy")
    press("Escape")
    expect(instance.api.tree.move("site", "archive", 2)).toBe(true)
    expect(shown()).toContain("  app\n  site\n    copy\narchive")
  })

  test("move() commits at once and reports the new parent", () => {
    const onRowsChange = vi.fn()
    const { instance } = render({ defaultRows: notes, onRowsChange })
    expect(instance.api.tree.move("archive", "site", 1)).toBe(true)
    expect(onRowsChange.mock.calls[0][1]).toMatchObject({
      reason: "imperative",
      parent: "projects",
      index: 0,
    })
    expect(instance.api.tree.move("projects", "copy", 0)).toBe(false)
  })
})

describe("createTreeReorder with a pointer", () => {
  test("a drag moves by the rows' middles and goes in a level for every indent sideways", async () => {
    const onRowsChange = vi.fn()
    const { instance, els } = render({ defaultRows: notes, onRowsChange })
    pointer("pointerdown", { target: els.get("archive"), x: 10, y: 110 })
    // Up past copy's middle (70) but not app's (90), and two indents right: a child of site.
    pointer("pointermove", { x: 58, y: 85 })
    await frame()
    expect(outlineOf(instance.api.tree.rows(instance.get()))).toContain(
      "    copy\n    archive\n  app"
    )
    // One indent back left: after site, before app.
    pointer("pointermove", { x: 34, y: 85 })
    await frame()
    expect(outlineOf(instance.api.tree.rows(instance.get()))).toContain(
      "    copy\n  archive\n  app"
    )
    pointer("pointerup", { x: 34, y: 85 })
    expect(onRowsChange).toHaveBeenCalledTimes(1)
    expect(onRowsChange.mock.calls[0][1]).toMatchObject({
      reason: "drag",
      key: "archive",
      parent: "projects",
      index: 1,
    })
  })

  test("Escape during a drag puts the rows back", async () => {
    const onRowsChange = vi.fn()
    const { instance, els } = render({ defaultRows: notes, onRowsChange })
    pointer("pointerdown", { target: els.get("inbox"), x: 10, y: 10 })
    pointer("pointermove", { x: 10, y: 90 })
    await frame()
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    )
    pointer("pointerup", { x: 10, y: 90 })
    expect(onRowsChange).not.toHaveBeenCalled()
    expect(instance.get().moving).toBeNull()
  })
})

describe("createTreeReorder with rows the owner changes mid-move", () => {
  test("a row dropped where it was keeps the owner's rows", () => {
    const onRowsChange = vi.fn()
    const { instance, shown } = render({
      rows: notes,
      defaultRows: notes,
      onRowsChange,
    })
    instance.api.tree.grab("site")
    const next = notes.filter((row) => row.key !== "inbox")
    instance.setOptions({ rows: next, defaultRows: notes, onRowsChange })
    expect(shown()).toBe(outlineOf(next))
    instance.api.tree.drop()
    expect(onRowsChange).not.toHaveBeenCalled()
  })

  test("a moved row lands where the user put it, among the owner's rows", () => {
    const onRowsChange = vi.fn()
    const { instance } = render({
      rows: notes,
      defaultRows: notes,
      onRowsChange,
    })
    instance.api.tree.grab("app")
    instance.api.tree.place(0, 0)
    const next = rows(`
inbox
projects
  site
  app
archive
todo
`)
    instance.setOptions({ rows: next, defaultRows: notes, onRowsChange })
    instance.api.tree.drop()
    expect(outlineOf(onRowsChange.mock.calls[0][0])).toBe(
      outlineOf(
        rows(`
app
inbox
projects
  site
archive
todo
`)
      )
    )
  })

  test("a row the owner deletes ends the move", () => {
    const onRowsChange = vi.fn()
    const { instance } = render({
      rows: notes,
      defaultRows: notes,
      onRowsChange,
    })
    instance.api.tree.grab("site")
    instance.api.tree.place(0, 0)
    const next = notes.filter((row) => row.key !== "site" && row.key !== "copy")
    instance.setOptions({ rows: next, defaultRows: notes, onRowsChange })
    expect(instance.get().moving).toBeNull()
    instance.api.tree.drop()
    expect(onRowsChange).not.toHaveBeenCalled()
  })
})
