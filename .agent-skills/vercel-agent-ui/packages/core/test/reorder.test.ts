// @vitest-environment jsdom
// `createReorder` and `bindDrag` as a component of your own uses them,
// through the public entry only: a sortable list on `createRovingFocus` and
// `createReorder`. `bind` from the kernel stands in for an adapter, and the
// render helper moves elements into the rendered order like a framework does.
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createChange,
  createReorder,
  definePrimitive,
  createRovingFocus,
  bindDrag,
  type ChangeDetails,
  type PrimitiveInstance,
  type ReorderDraft,
} from "../src/index"
import { partAttrs } from "../src/testing"
import { bind } from "../src/foundation/kernel/part"
import {
  columnsOf,
  dropIndex,
  gridDropIndex,
  movedTo,
} from "../src/foundation/drag-and-drop/reorder"

type SortableOptions = {
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (
    value: string[],
    details: ChangeDetails<"drag" | "move-key" | "imperative">
  ) => void
  orientation?: "horizontal" | "vertical" | "grid"
  group?: string[]
  preview?: boolean
}
type SortableState = {
  value: string[]
  focused: string | null
  moving: ReorderDraft | null
}
type ItemProps = { value: string; disabled?: boolean }

const sortable = definePrimitive({
  name: "sortable",
  options: {
    value: "list",
    defaultValue: "list",
    onValueChange: "callback",
    orientation: "string",
    group: "list",
    preview: "boolean",
  },
  state: (options: SortableOptions): SortableState => ({
    value: options.value ?? options.defaultValue ?? [],
    focused: null,
    moving: null,
  }),
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  api: (context) => {
    const change = createChange(context)
    const orientation = () => context.options().orientation ?? "vertical"
    const roving = createRovingFocus<SortableState, ItemProps>(context, {
      slot: "item",
      key: "focused",
      orientation: () =>
        orientation() === "vertical" ? "vertical" : "horizontal",
    })
    const reorder = createReorder<SortableState, ItemProps>(context, {
      slot: "item",
      key: "value",
      draft: "moving",
      set: (value, details) => change("value", value, details),
      orientation,
      disabled: (item) => !!item.props.disabled,
      group: (key) => {
        const group = context.options().group ?? []
        return group.includes(key) ? group : [key]
      },
      preview: context.options().preview,
    })
    return { roving, reorder }
  },
  slots: (slot) => ({
    item: slot<ItemProps, { grabbed: boolean }>({
      props: { value: "string", disabled: "boolean" },
      state: (state, { key }) => ({ grabbed: state.moving?.key === key }),
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "data-grabbed": state.moving?.key === part.key ? "" : undefined,
      }),
      on: {
        keydown: (event, { el, api, key }) =>
          api.reorder.keydown(event, key) || api.roving.keydown(event, el!),
        pointerdown: (event, { api, key }) =>
          api.reorder.pointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.reorder.bind(el, part),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
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

// Items 40px tall stacked from the top, by where each element is in the list now.
function stackRects(list: HTMLElement) {
  const top = (el: HTMLElement) => [...list.children].indexOf(el) * 40
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return {
        top: top(this),
        left: 0,
        width: 100,
        height: 40,
        bottom: top(this) + 40,
        right: 100,
      } as DOMRect
    }
  )
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
    function (this: HTMLElement) {
      return top(this)
    }
  )
}

function render(
  options: SortableOptions,
  items: ItemProps[] = ["a", "b", "c", "d"].map((value) => ({ value }))
) {
  const instance = sortable({ id: "s", ...options }) as ReturnType<
    typeof sortable
  > &
    PrimitiveInstance
  const list = document.createElement("div")
  document.body.append(list)
  const els = new Map<string, HTMLElement>()
  for (const props of items) {
    const el = document.createElement("div")
    el.textContent = `Item ${props.value}`
    const part = instance.part("item", props)
    const write = () => {
      for (const [name, value] of Object.entries(partAttrs(part))) {
        if (value === undefined) {
          el.removeAttribute(name)
        } else {
          el.setAttribute(name, value)
        }
      }
    }
    write()
    cleanups.push(instance.subscribe(write))
    list.append(el)
    cleanups.push(bind(part, el))
    els.set(props.value, el)
  }
  // Renders the order a microtask after it changes, by moving elements, as React and Vue do.
  let shown = instance.api.reorder.order(instance.get())
  cleanups.push(
    instance.subscribe(() =>
      queueMicrotask(() => {
        const order = instance.api.reorder.order(instance.get())
        if (order === shown) {
          return
        }
        shown = order
        // Moving an element out of the document drops its focus, like a browser does.
        const active = document.activeElement as HTMLElement | null
        for (const key of order) {
          list.append(els.get(key)!)
        }
        if (active && list.contains(active)) {
          active.blur()
        }
      })
    )
  )
  const press = (key: string, init: KeyboardEventInit = {}) =>
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      })
    )
  const shownOrder = () =>
    [...list.children].map((el) => el.textContent!.slice(5))
  return { instance, list, els, press, shownOrder }
}

const pointer = (
  type: string,
  init: { x?: number; y?: number; target?: EventTarget; id?: number } = {}
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
    buttons: type === "pointerup" ? 0 : 1,
  })
  Object.assign(event, {
    pointerId: init.id ?? 1,
    isPrimary: true,
    pointerType: "mouse",
  })
  ;(init.target ?? document).dispatchEvent(event)
  return event
}

describe("createReorder with the keyboard", () => {
  test("Space picks an item up, arrows move it, and Space drops it in one change", async () => {
    const onValueChange = vi.fn()
    const { instance, els, press, shownOrder } = render({
      defaultValue: ["a", "b", "c", "d"],
      onValueChange,
    })
    await tick()
    els.get("b")!.focus()
    press(" ")
    expect(instance.get().moving).toMatchObject({ key: "b", pointer: false })
    expect(els.get("b")!.hasAttribute("data-grabbed")).toBe(true)
    press("ArrowDown")
    press("ArrowDown")
    await tick()
    expect(shownOrder()).toEqual(["a", "c", "d", "b"])
    expect(onValueChange).not.toHaveBeenCalled()
    press(" ")
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange.mock.calls[0][0]).toEqual(["a", "c", "d", "b"])
    expect(onValueChange.mock.calls[0][1]).toMatchObject({ reason: "move-key" })
    expect(instance.get()).toMatchObject({
      value: ["a", "c", "d", "b"],
      moving: null,
    })
  })

  test("the moved item keeps focus when the list moves its element", async () => {
    const { els, press } = render({ defaultValue: ["a", "b", "c", "d"] })
    await tick()
    els.get("a")!.focus()
    press("Enter")
    press("ArrowDown")
    await tick()
    expect(document.activeElement).toBe(els.get("a"))
  })

  test("Home and End move the item to either end, and arrows stop there", async () => {
    const { press, els, shownOrder } = render({
      defaultValue: ["a", "b", "c", "d"],
    })
    await tick()
    els.get("c")!.focus()
    press(" ")
    press("Home")
    await tick()
    expect(shownOrder()).toEqual(["c", "a", "b", "d"])
    press("ArrowUp")
    press("End")
    await tick()
    expect(shownOrder()).toEqual(["a", "b", "d", "c"])
  })

  test("Escape puts the item back and changes nothing", async () => {
    const onValueChange = vi.fn()
    const { instance, els, press, shownOrder } = render({
      defaultValue: ["a", "b", "c", "d"],
      onValueChange,
    })
    await tick()
    els.get("a")!.focus()
    press(" ")
    press("ArrowDown")
    press("Escape")
    await tick()
    expect(shownOrder()).toEqual(["a", "b", "c", "d"])
    expect(instance.get().moving).toBeNull()
    expect(onValueChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(els.get("a"))
  })

  test("arrows move focus between items until one is picked up", async () => {
    const { els, press } = render({ defaultValue: ["a", "b", "c", "d"] })
    await tick()
    els.get("a")!.focus()
    press("ArrowDown")
    expect(document.activeElement).toBe(els.get("b"))
  })

  test("other keys are swallowed while an item is up, so focus stays on it", async () => {
    const { els, press } = render({ defaultValue: ["a", "b", "c", "d"] })
    await tick()
    els.get("a")!.focus()
    press(" ")
    press("ArrowRight")
    press("ArrowDown", { ctrlKey: true })
    expect(document.activeElement).toBe(els.get("a"))
  })

  test("horizontal lists move with Left and Right, swapped right to left", async () => {
    const { list, els, press, shownOrder } = render({
      defaultValue: ["a", "b", "c", "d"],
      orientation: "horizontal",
    })
    list.style.direction = "rtl"
    await tick()
    els.get("a")!.focus()
    press(" ")
    press("ArrowLeft")
    await tick()
    expect(shownOrder()).toEqual(["b", "a", "c", "d"])
  })

  test("a disabled item can't be picked up, but others move past it", async () => {
    const { els, press, shownOrder } = render(
      { defaultValue: ["a", "b", "c"] },
      [{ value: "a" }, { value: "b", disabled: true }, { value: "c" }]
    )
    await tick()
    els.get("b")!.focus()
    press(" ")
    expect(els.get("b")!.hasAttribute("data-grabbed")).toBe(false)
    els.get("a")!.focus()
    press(" ")
    press("ArrowDown")
    press(" ")
    await tick()
    expect(shownOrder()).toEqual(["b", "a", "c"])
  })

  test("a canceled change puts the item back", async () => {
    const { instance, els, press, shownOrder } = render({
      defaultValue: ["a", "b", "c", "d"],
      onValueChange: (_value, details) => details.cancel(),
    })
    await tick()
    els.get("a")!.focus()
    press(" ")
    press("ArrowDown")
    press(" ")
    await tick()
    expect(instance.get()).toMatchObject({
      value: ["a", "b", "c", "d"],
      moving: null,
    })
    expect(shownOrder()).toEqual(["a", "b", "c", "d"])
  })

  test("a controlled list shows the dropped order until its new value arrives, without the old one between", async () => {
    let instance!: ReturnType<typeof render>["instance"]
    const rendered: string[][] = []
    const onValueChange = (value: string[]) =>
      queueMicrotask(() => instance.setOptions({ value, onValueChange }))
    const view = render({ value: ["a", "b", "c", "d"], onValueChange })
    instance = view.instance
    await tick()
    view.els.get("a")!.focus()
    view.press(" ")
    view.press("ArrowDown")
    cleanups.push(
      instance.subscribe(() =>
        rendered.push(instance.api.reorder.order(instance.get()))
      )
    )
    view.press(" ")
    await tick()
    expect(instance.get()).toMatchObject({
      value: ["b", "a", "c", "d"],
      moving: null,
    })
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.every((order) => order[0] === "b")).toBe(true)
  })

  test("a controlled list whose parent keeps the old value shows it again", async () => {
    const { instance, els, press, shownOrder } = render({
      value: ["a", "b", "c", "d"],
      onValueChange: () => {},
    })
    await tick()
    els.get("a")!.focus()
    press(" ")
    press("ArrowDown")
    press(" ")
    await tick()
    await tick()
    expect(instance.get().moving).toBeNull()
    expect(shownOrder()).toEqual(["a", "b", "c", "d"])
  })

  test("a controlled list whose new value also drops an item lets go of the dropped one", async () => {
    let instance!: ReturnType<typeof render>["instance"]
    const onValueChange = (value: string[]) =>
      queueMicrotask(() =>
        instance.setOptions({
          value: value.filter((key) => key !== "d"),
          onValueChange,
        })
      )
    const view = render({ value: ["a", "b", "c", "d"], onValueChange })
    instance = view.instance
    await tick()
    view.els.get("a")!.focus()
    view.press(" ")
    view.press("ArrowDown")
    view.press(" ")
    await tick()
    await tick()
    expect(instance.get().moving).toBeNull()
    expect(instance.api.reorder.order(instance.get())).toEqual(["b", "a", "c"])
  })

  test("move() commits at once, for a menu item like Move to top", () => {
    const onValueChange = vi.fn()
    const { instance } = render({
      defaultValue: ["a", "b", "c", "d"],
      onValueChange,
    })
    expect(instance.api.reorder.move("c", 0)).toBe(true)
    expect(onValueChange.mock.calls[0][1]).toMatchObject({
      reason: "imperative",
    })
    expect(instance.get().value).toEqual(["c", "a", "b", "d"])
    expect(instance.api.reorder.move("c", 0)).toBe(false)
  })
})

describe("createReorder with a pointer", () => {
  test("a drag past the threshold picks the item up, reorders by the items' middles, and drops in one change", async () => {
    const onValueChange = vi.fn()
    const { instance, list, els, shownOrder } = render({
      defaultValue: ["a", "b", "c", "d"],
      onValueChange,
    })
    stackRects(list)
    await tick()
    pointer("pointerdown", { target: els.get("a"), x: 10, y: 20 })
    pointer("pointermove", { x: 10, y: 21 })
    await frame()
    expect(instance.get().moving).toBeNull()
    pointer("pointermove", { x: 10, y: 105 })
    await frame()
    expect(instance.get().moving).toMatchObject({ key: "a", pointer: true })
    await tick()
    expect(shownOrder()).toEqual(["b", "c", "a", "d"])
    pointer("pointerup", { x: 10, y: 105 })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange.mock.calls[0][1]).toMatchObject({ reason: "drag" })
    expect(instance.get()).toMatchObject({
      value: ["b", "c", "a", "d"],
      moving: null,
    })
  })

  test("the dragged element gets --drag-x and --drag-y that keep it under the pointer, cleared on drop", async () => {
    const { list, els } = render({ defaultValue: ["a", "b", "c", "d"] })
    stackRects(list)
    await tick()
    pointer("pointerdown", { target: els.get("a"), x: 10, y: 20 })
    pointer("pointermove", { x: 15, y: 70 })
    await frame()
    await tick()
    await frame()
    // The pointer moved 50 down and the element moved 40 down to second place, so 10 is left to translate.
    expect(els.get("a")!.style.getPropertyValue("--drag-y")).toBe("10px")
    expect(els.get("a")!.style.getPropertyValue("--drag-x")).toBe("5px")
    pointer("pointerup", { x: 15, y: 70 })
    expect(els.get("a")!.style.getPropertyValue("--drag-y")).toBe("")
  })

  test("a press that doesn't move is a click, and changes nothing", async () => {
    const onValueChange = vi.fn()
    const { instance, list, els } = render({
      defaultValue: ["a", "b", "c", "d"],
      onValueChange,
    })
    stackRects(list)
    await tick()
    pointer("pointerdown", { target: els.get("a"), x: 10, y: 20 })
    pointer("pointerup", { x: 10, y: 20 })
    expect(instance.get().moving).toBeNull()
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("a press something else already handled, like a toggle inside the item, doesn't start a drag", async () => {
    const onValueChange = vi.fn()
    const { instance, list } = render({
      defaultValue: ["a", "b", "c", "d"],
      onValueChange,
    })
    stackRects(list)
    await tick()
    const down = new MouseEvent("pointerdown", {
      cancelable: true,
      clientX: 10,
      clientY: 20,
      buttons: 1,
    })
    Object.assign(down, { pointerId: 1, isPrimary: true, pointerType: "mouse" })
    down.preventDefault()
    instance.api.reorder.pointerdown(down as PointerEvent, "a")
    pointer("pointermove", { x: 10, y: 80 })
    await frame()
    expect(instance.get().moving).toBeNull()
    pointer("pointerup", { x: 10, y: 80 })
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("Escape during a drag puts the item back", async () => {
    const onValueChange = vi.fn()
    const { instance, list, els, shownOrder } = render({
      defaultValue: ["a", "b", "c", "d"],
      onValueChange,
    })
    stackRects(list)
    await tick()
    pointer("pointerdown", { target: els.get("a"), x: 10, y: 20 })
    pointer("pointermove", { x: 10, y: 105 })
    await frame()
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    )
    pointer("pointerup", { x: 10, y: 105 })
    await tick()
    expect(instance.get().moving).toBeNull()
    expect(shownOrder()).toEqual(["a", "b", "c", "d"])
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("pointercancel, like the browser taking over for a scroll, puts the item back", async () => {
    const { instance, list, els } = render({
      defaultValue: ["a", "b", "c", "d"],
    })
    stackRects(list)
    await tick()
    pointer("pointerdown", { target: els.get("a"), x: 10, y: 20 })
    pointer("pointermove", { x: 10, y: 105 })
    await frame()
    pointer("pointercancel")
    expect(instance.get()).toMatchObject({
      value: ["a", "b", "c", "d"],
      moving: null,
    })
  })

  test("destroying the list mid-drag stops following the pointer", async () => {
    const { instance, list, els } = render({
      defaultValue: ["a", "b", "c", "d"],
    })
    stackRects(list)
    await tick()
    const remove = vi.spyOn(document, "removeEventListener")
    pointer("pointerdown", { target: els.get("a"), x: 10, y: 20 })
    pointer("pointermove", { x: 10, y: 105 })
    await frame()
    instance.destroy()
    expect(remove.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining([
        "pointermove",
        "pointerup",
        "pointercancel",
        "keydown",
      ])
    )
  })
})

describe("the pure pieces", () => {
  test("dropIndex counts the middles the pointer has passed, backwards right to left", () => {
    expect(dropIndex([20, 60, 100], 70)).toBe(2)
    expect(dropIndex([20, 60, 100], 0)).toBe(0)
    expect(dropIndex([300, 200, 100], 150, { reversed: true })).toBe(2)
  })

  test("movedTo returns the same array when the item is already there", () => {
    const order = ["a", "b", "c"]
    expect(movedTo(order, "a", 0)).toBe(order)
    expect(movedTo(order, "a", 5)).toEqual(["b", "c", "a"])
  })

  test("movedTo moves several keys as one block in list order", () => {
    const order = ["a", "b", "c", "d", "e"]
    expect(movedTo(order, ["d", "b"], 0)).toEqual(["b", "d", "a", "c", "e"])
    expect(movedTo(order, ["a", "c"], 3)).toEqual(["b", "d", "e", "a", "c"])
    expect(movedTo(["a", "b", "c"], ["b", "c"], 1)).toEqual(["a", "b", "c"])
  })

  test("gridDropIndex goes after rows above the pointer and the passed middles on its row", () => {
    // Two rows of three 100 by 40 tiles.
    const rects = [0, 1, 2, 3, 4, 5].map((i) => {
      const left = (i % 3) * 100
      const top = Math.floor(i / 3) * 40
      return { left, top, right: left + 100, bottom: top + 40 }
    })
    expect(gridDropIndex(rects, { x: 10, y: 10 })).toBe(0)
    expect(gridDropIndex(rects, { x: 160, y: 10 })).toBe(2)
    expect(gridDropIndex(rects, { x: 10, y: 50 })).toBe(3)
    expect(gridDropIndex(rects, { x: 290, y: 70 })).toBe(6)
    expect(gridDropIndex(rects, { x: 0, y: 200 })).toBe(6)
    expect(gridDropIndex(rects, { x: 140, y: 10 }, { reversed: true })).toBe(2)
  })

  test("columnsOf counts the items on the first row", () => {
    expect(columnsOf([0, 0, 0, 40, 40])).toBe(3)
    expect(columnsOf([0, 40, 80])).toBe(1)
    expect(columnsOf([])).toBe(1)
  })
})

// Tiles 100 by 40 in rows of `columns`, by where each element is in the list now.
function gridRects(list: HTMLElement, columns: number) {
  const box = (el: HTMLElement) => {
    const index = [...list.children].indexOf(el)
    const left = (index % columns) * 100
    const top = Math.floor(index / columns) * 40
    return {
      left,
      top,
      right: left + 100,
      bottom: top + 40,
      width: 100,
      height: 40,
    }
  }
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return box(this) as DOMRect
    }
  )
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
    function (this: HTMLElement) {
      return box(this).top
    }
  )
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(
    function (this: HTMLElement) {
      return box(this).left
    }
  )
}

const six = ["a", "b", "c", "d", "e", "f"]

describe("createReorder with groups", () => {
  test("picking up a grouped item gathers the group where it is and moves it as one block", async () => {
    const onValueChange = vi.fn()
    const { instance, els, press, shownOrder } = render(
      { defaultValue: six, group: ["b", "e"], onValueChange },
      six.map((value) => ({ value }))
    )
    await tick()
    els.get("e")!.focus()
    press(" ")
    expect(instance.get().moving).toMatchObject({ key: "e", keys: ["b", "e"] })
    await tick()
    expect(shownOrder()).toEqual(["a", "c", "d", "b", "e", "f"])
    expect(instance.api.reorder.moving(instance.get(), "b")).toBe(true)
    expect(instance.api.reorder.moving(instance.get(), "a")).toBe(false)
    press("ArrowDown")
    press(" ")
    await tick()
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(instance.get().value).toEqual(["a", "c", "d", "f", "b", "e"])
  })

  test("Escape puts the whole group back where each item was", async () => {
    const { instance, els, press, shownOrder } = render(
      { defaultValue: six, group: ["a", "f"] },
      six.map((value) => ({ value }))
    )
    await tick()
    els.get("a")!.focus()
    press(" ")
    press("ArrowDown")
    press("Escape")
    await tick()
    expect(instance.get()).toMatchObject({ value: six, moving: null })
    expect(shownOrder()).toEqual(six)
  })

  test("announcements count the items that move together", async () => {
    const { els, press } = render(
      { defaultValue: six, group: ["a", "c"] },
      six.map((value) => ({ value }))
    )
    await tick()
    els.get("a")!.focus()
    press(" ")
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(document.body.textContent).toContain(
      "Picked up 2 items, position 1 of 6."
    )
  })
})

describe("createReorder in a grid", () => {
  test("Left and Right move by one, Up and Down by a row, and a row past either end stays put", async () => {
    const { instance, list, els, press } = render(
      { defaultValue: six, orientation: "grid" },
      six.map((value) => ({ value }))
    )
    gridRects(list, 3)
    await tick()
    els.get("a")!.focus()
    press(" ")
    press("ArrowDown")
    expect(instance.get().moving?.order).toEqual(["b", "c", "d", "a", "e", "f"])
    press("ArrowDown")
    expect(instance.get().moving?.order).toEqual(["b", "c", "d", "a", "e", "f"])
    press("ArrowRight")
    expect(instance.get().moving?.order).toEqual(["b", "c", "d", "e", "a", "f"])
    press("ArrowUp")
    expect(instance.get().moving?.order).toEqual(["b", "a", "c", "d", "e", "f"])
    press("Escape")
  })

  test("a drag finds its place by rows, then by the middles on the pointer's row", async () => {
    const onValueChange = vi.fn()
    const { instance, list, els, shownOrder } = render(
      { defaultValue: six, orientation: "grid", onValueChange },
      six.map((value) => ({ value }))
    )
    gridRects(list, 3)
    await tick()
    pointer("pointerdown", { target: els.get("a"), x: 50, y: 20 })
    // Onto the second row, past the middle of its first tile.
    pointer("pointermove", { x: 160, y: 60 })
    await frame()
    await tick()
    expect(shownOrder()).toEqual(["b", "c", "d", "e", "a", "f"])
    pointer("pointerup", { x: 160, y: 60 })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(instance.get().value).toEqual(["b", "c", "d", "e", "a", "f"])
  })
})

describe("createReorder with a preview", () => {
  test("a copy follows the pointer above the page with the group's count, and goes on drop", async () => {
    const { list, els } = render(
      { defaultValue: ["a", "b", "c", "d"], group: ["a", "b"], preview: true },
      ["a", "b", "c", "d"].map((value) => ({ value }))
    )
    stackRects(list)
    await tick()
    pointer("pointerdown", { target: els.get("a"), x: 10, y: 20 })
    pointer("pointermove", { x: 30, y: 70 })
    await frame()
    const copy = document.querySelector<HTMLElement>("[data-drag-preview]")!
    expect(copy).not.toBeNull()
    expect(copy.getAttribute("aria-hidden")).toBe("true")
    expect(copy.getAttribute("data-drag-count")).toBe("2")
    expect(copy.style.translate).toBe("20px 50px")
    // The item stays in the list, where it would drop, without following the pointer.
    expect(els.get("a")!.style.getPropertyValue("--drag-y")).toBe("")
    pointer("pointerup", { x: 30, y: 70 })
    expect(document.querySelector("[data-drag-preview]")).toBeNull()
  })
})

describe("bindDrag", () => {
  test("reports nothing before the threshold, then starts once and moves once per frame", async () => {
    const el = document.createElement("div")
    document.body.append(el)
    const onStart = vi.fn()
    // The sample is one object for every report, so each is copied.
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const down = pointer("pointerdown", { target: el }) as PointerEvent
    bindDrag(el, down, {
      threshold: 3,
      onStart,
      onMove: (sample) => onMove({ ...sample }),
      onEnd,
    })
    pointer("pointermove", { x: 2 })
    await frame()
    expect(onStart).not.toHaveBeenCalled()
    pointer("pointermove", { x: 5 })
    pointer("pointermove", { x: 8 })
    await frame()
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove.mock.calls[0][0]).toMatchObject({ x: 8, movementX: 8 })
    pointer("pointerup", { x: 8 })
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), false)
  })

  test("a press canceled before the threshold ends once, as canceled", () => {
    const el = document.createElement("div")
    document.body.append(el)
    const onEnd = vi.fn()
    const down = pointer("pointerdown", { target: el }) as PointerEvent
    bindDrag(el, down, { threshold: 3, onMove: () => {}, onEnd })
    pointer("pointercancel")
    pointer("pointerup")
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), true)
  })

  test("a drag canceled with Escape swallows the click its release sends", async () => {
    const el = document.createElement("a")
    el.href = "#card"
    document.body.append(el)
    const onClick = vi.fn()
    el.addEventListener("click", onClick)
    const onEnd = vi.fn()
    const down = pointer("pointerdown", { target: el }) as PointerEvent
    bindDrag(el, down, {
      threshold: 3,
      cancelOnEscape: true,
      onMove: () => {},
      onEnd,
    })
    pointer("pointermove", { x: 20 })
    await frame()
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    )
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), true)
    pointer("pointerup", { target: el })
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
    expect(onClick).not.toHaveBeenCalled()
    await tick()
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test("another pointer's release doesn't disarm the click guard of a drag canceled with Escape", async () => {
    const el = document.createElement("a")
    el.href = "#card"
    document.body.append(el)
    const onClick = vi.fn()
    el.addEventListener("click", onClick)
    const down = pointer("pointerdown", { target: el }) as PointerEvent
    bindDrag(el, down, {
      threshold: 3,
      cancelOnEscape: true,
      onMove: () => {},
      onEnd: () => {},
    })
    pointer("pointermove", { x: 20 })
    await frame()
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    )
    pointer("pointerdown", { id: 2 })
    pointer("pointerup", { id: 2 })
    await tick()
    pointer("pointerup", { target: el })
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a release that sends no click after Escape, like a finger lifting, leaves the next click alone", async () => {
    const el = document.createElement("a")
    el.href = "#card"
    document.body.append(el)
    const onClick = vi.fn()
    el.addEventListener("click", onClick)
    const down = pointer("pointerdown", { target: el }) as PointerEvent
    bindDrag(el, down, {
      threshold: 3,
      cancelOnEscape: true,
      onMove: () => {},
      onEnd: () => {},
    })
    pointer("pointermove", { x: 20 })
    await frame()
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    )
    pointer("pointerup", { target: el })
    await tick()
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
    expect(onClick).toHaveBeenCalledOnce()
  })

  test("Escape ends the drag for good", async () => {
    const el = document.createElement("div")
    document.body.append(el)
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const down = pointer("pointerdown", { target: el }) as PointerEvent
    bindDrag(el, down, { threshold: 3, cancelOnEscape: true, onMove, onEnd })
    pointer("pointermove", { x: 20 })
    await frame()
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    )
    const moves = onMove.mock.calls.length
    pointer("pointermove", { x: 60 })
    await frame()
    pointer("pointerup", { x: 60 })
    expect(onMove).toHaveBeenCalledTimes(moves)
    expect(onEnd).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), true)
  })

  test("Escape's click guard prevents the dragged pointer's click and lets another pointer's click through", async () => {
    const el = document.createElement("a")
    el.href = "#card"
    document.body.append(el)
    const onClick = vi.fn()
    el.addEventListener("click", onClick)
    const down = pointer("pointerdown", { target: el }) as PointerEvent
    bindDrag(el, down, {
      threshold: 3,
      cancelOnEscape: true,
      onMove: () => {},
      onEnd: () => {},
    })
    pointer("pointermove", { x: 20 })
    await frame()
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    )
    pointer("pointerdown", { id: 2, target: el })
    pointer("pointerup", { id: 2, target: el })
    const other = Object.assign(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
      {
        pointerId: 2,
      }
    )
    expect(el.dispatchEvent(other)).toBe(true)
    expect(onClick).toHaveBeenCalledOnce()
    pointer("pointerup", { target: el })
    const own = Object.assign(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
      { pointerId: 1 }
    )
    expect(el.dispatchEvent(own)).toBe(false)
    expect(onClick).toHaveBeenCalledOnce()
  })

  test("onStart returning false stops following the pointer", async () => {
    const el = document.createElement("div")
    document.body.append(el)
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const down = pointer("pointerdown", { target: el }) as PointerEvent
    bindDrag(el, down, { threshold: 3, onStart: () => false, onMove, onEnd })
    pointer("pointermove", { x: 10 })
    await frame()
    pointer("pointerup", { x: 10 })
    expect(onMove).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })
})

describe("createReorder after a missed release", () => {
  test("a new pen press ends the drag that missed its release, without committing it, and picks up the pressed item", async () => {
    const onValueChange = vi.fn()
    const { instance, list, els } = render({
      defaultValue: ["a", "b", "c", "d"],
      onValueChange,
    })
    stackRects(list)
    await tick()
    const pen = (
      type: string,
      init: { x: number; y: number; id: number; target?: EventTarget }
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: init.x,
        clientY: init.y,
        buttons: 1,
      })
      Object.assign(event, {
        pointerId: init.id,
        isPrimary: true,
        pointerType: "pen",
      })
      ;(init.target ?? document).dispatchEvent(event)
    }
    pen("pointerdown", { target: els.get("a"), x: 10, y: 20, id: 1 })
    pen("pointermove", { x: 10, y: 105, id: 1 })
    await frame()
    expect(instance.get().moving).toMatchObject({ key: "a" })
    pen("pointerdown", { target: els.get("b"), x: 10, y: 20, id: 2 })
    pen("pointermove", { x: 10, y: 105, id: 2 })
    await frame()
    expect(instance.get().moving).toMatchObject({ key: "b" })
    expect(onValueChange).not.toHaveBeenCalled()
    expect(instance.get().value).toEqual(["a", "b", "c", "d"])
  })
})

// A drop commits the order the list has now, moved: only `set` changes which items there are.
test("an item the owner removes mid-drag stays removed when the drag drops", async () => {
  const onValueChange = vi.fn()
  const { instance, list, els } = render({
    value: ["a", "b", "c", "d"],
    onValueChange,
  })
  stackRects(list)
  await tick()
  pointer("pointerdown", { target: els.get("a"), x: 10, y: 20 })
  pointer("pointermove", { x: 10, y: 65 })
  await frame()
  expect(instance.get().moving).toMatchObject({ key: "a", pointer: true })
  instance.setOptions({ value: ["a", "b", "c"], onValueChange })
  pointer("pointerup", { x: 10, y: 65 })
  expect(onValueChange).toHaveBeenCalledTimes(1)
  expect(onValueChange.mock.calls[0][0]).toEqual(["b", "a", "c"])
})

// React renders a controlled value before it hands it over.
test("an item the owner removes mid-drag stays removed when the value renders before it lands", async () => {
  const onValueChange = vi.fn()
  const { instance, list, els } = render({
    value: ["a", "b", "c", "d"],
    onValueChange,
  })
  stackRects(list)
  await tick()
  pointer("pointerdown", { target: els.get("a"), x: 10, y: 20 })
  pointer("pointermove", { x: 10, y: 65 })
  await frame()
  const next = { value: ["a", "b", "c"], onValueChange }
  instance.preview({ ...next, id: instance.id })
  instance.setOptions(next)
  pointer("pointerup", { x: 10, y: 65 })
  expect(onValueChange).toHaveBeenCalledTimes(1)
  expect(onValueChange.mock.calls[0][0]).toEqual(["b", "a", "c"])
})

test("an order the owner changes mid-move stays when the item drops where it was", () => {
  const onValueChange = vi.fn()
  const { instance } = render({ value: ["a", "b", "c"], onValueChange })
  instance.api.reorder.grab("a")
  instance.setOptions({ value: ["b", "a", "c"], onValueChange })
  expect(instance.api.reorder.order(instance.get())).toEqual(["b", "a", "c"])
  instance.api.reorder.drop()
  expect(onValueChange).not.toHaveBeenCalled()
})

test("an order the owner changes mid-move keeps the moved item where the user put it", () => {
  const onValueChange = vi.fn()
  const { instance } = render({ value: ["a", "b", "c", "d"], onValueChange })
  instance.api.reorder.grab("a")
  instance.api.reorder.moveTo(1)
  instance.setOptions({ value: ["d", "c", "b", "a", "e"], onValueChange })
  instance.api.reorder.drop()
  expect(onValueChange.mock.calls[0][0]).toEqual(["d", "a", "c", "b", "e"])
})

test("a group the owner reverses mid-move stays where the user put it", () => {
  const onValueChange = vi.fn()
  const { instance } = render({
    value: ["a", "b", "c", "d"],
    group: ["a", "b"],
    onValueChange,
  })
  instance.api.reorder.grab("a")
  instance.api.reorder.moveTo(1)
  instance.setOptions({
    value: ["b", "a", "c", "d"],
    group: ["a", "b"],
    onValueChange,
  })
  instance.api.reorder.drop()
  expect(onValueChange.mock.calls[0][0]).toEqual(["c", "b", "a", "d"])
})
