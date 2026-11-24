import { describe, expect, test } from "vitest"
import {
  definePrimitive,
  renderVersion,
} from "../src/foundation/kernel/primitive"
import {
  createStore,
  markChangedInPlace,
  sameSlotState,
  subscribeSkipping,
} from "../src/foundation/kernel/store"
import { select } from "../src/foundation/kernel/selects"

describe("the store", () => {
  test("setting a value the state already has reaches no listener", () => {
    const store = createStore(
      { open: false, highlighted: null as string | null },
      []
    )
    let runs = 0
    store.subscribe(() => runs++)
    store.set({ open: true, highlighted: null })
    store.set({ open: true })
    expect(runs).toBe(1)
  })

  test("a selected listener runs only when the key takes or leaves its value", () => {
    const store = createStore({ highlighted: null as string | null }, [
      "highlighted",
    ])
    const runs = { a: 0, b: 0 }
    select(store, "highlighted", "a", () => runs.a++)
    select(store, "highlighted", "b", () => runs.b++)
    store.set({ highlighted: "a" })
    store.set({ highlighted: "c" })
    store.set({ highlighted: "b" })
    expect(runs).toEqual({ a: 2, b: 1 })
  })

  test("a selected listener on an array runs when its value joins or leaves it", () => {
    const store = createStore({ panels: [] as string[] }, [])
    const runs: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    for (const value of Object.keys(runs)) {
      select(store, "panels", value, () => runs[value]++)
    }
    store.set({ panels: ["a", "b", "c"] })
    store.set({ panels: ["a", "c"] })
    store.set({ panels: ["a", "d", "c"] })
    expect(runs).toEqual({ a: 1, b: 2, c: 1, d: 1 })
  })

  test("no value joins or leaves an array unheard, whatever else moves", () => {
    const store = createStore({ panels: [] as string[] }, [])
    const values = ["a", "b", "c", "x"]
    const heard = new Set<string>()
    for (const value of values) {
      select(store, "panels", value, () => heard.add(value))
    }
    // Reorders, duplicates, and values that leave and come back in one change.
    const changes = [
      ["a", "b", "c"],
      ["c", "b", "a"],
      ["c", "c", "b"],
      ["b"],
      ["x", "b", "a"],
      ["a", "b", "x"],
      [],
    ]
    for (const panels of changes) {
      const before = store.get().panels
      heard.clear()
      store.set({ panels })
      for (const value of values.filter(
        (value) => before.includes(value) !== panels.includes(value)
      )) {
        expect(
          heard.has(value),
          `${value} joined or left [${panels}] unheard.`
        ).toBe(true)
      }
    }
  })

  test("a selected listener on a record runs when its entry is added, removed or changed", () => {
    const before = {
      kept: true,
      changed: false,
      removed: true,
      unset: undefined,
    }
    const store = createStore({ values: before as Record<string, unknown> }, [])
    const names = ["kept", "changed", "removed", "unset", "added", "absent"]
    const runs: Record<string, number> = Object.fromEntries(
      names.map((name) => [name, 0])
    )
    for (const name of names) {
      select(store, "values", name, () => runs[name]++)
    }
    // One write adds, removes and changes entries at once. An entry holding
    // undefined that's removed counts too.
    store.set({ values: { kept: true, changed: true, added: "x" } })
    expect(runs).toEqual({
      kept: 0,
      changed: 1,
      removed: 1,
      unset: 1,
      added: 1,
      absent: 0,
    })
  })

  test("a new record with the same entries reaches no selected listener", () => {
    const store = createStore(
      { values: { a: true, b: false } as Record<string, unknown> },
      []
    )
    let selected = 0
    let every = 0
    for (const name of ["a", "b", "c"]) {
      select(store, "values", name, () => selected++)
    }
    store.subscribe(() => every++)
    store.set({ values: { b: false, a: true } })
    expect(selected).toBe(0)
    // A new object is still a change for listeners that hear every one.
    expect(every).toBe(1)
  })

  test("entries named like Object's own properties are diffed as entries", () => {
    const store = createStore({ values: {} as Record<string, unknown> }, [])
    const runs: Record<string, number> = { constructor: 0, toString: 0 }
    for (const name of Object.keys(runs)) {
      select(store, "values", name, () => runs[name]++)
    }
    store.set({ values: { constructor: true } })
    store.set({ values: { toString: true } })
    expect(runs).toEqual({ constructor: 2, toString: 1 })
  })

  test("a selected listener on an array hears its value join when the array was null", () => {
    const store = createStore({ expanded: null as string[] | null }, [])
    const runs = { a: 0, c: 0 }
    select(store, "expanded", "a", () => runs.a++)
    select(store, "expanded", "c", () => runs.c++)
    store.set({ expanded: ["b", "a"] })
    store.set({ expanded: null })
    expect(runs).toEqual({ a: 2, c: 0 })
  })

  test("a selected listener on a record hears its entry added when the record was undefined", () => {
    const store = createStore(
      { values: undefined as Record<string, boolean> | undefined },
      []
    )
    const runs = { x: 0, y: 0 }
    select(store, "values", "x", () => runs.x++)
    select(store, "values", "y", () => runs.y++)
    store.set({ values: { x: true } })
    store.set({ values: undefined })
    expect(runs).toEqual({ x: 2, y: 0 })
  })

  test("a selected listener on a value hears it taken from null", () => {
    const store = createStore({ highlighted: null as string | null }, [])
    const runs = { a: 0, null: 0 }
    select(store, "highlighted", "a", () => runs.a++)
    select(store, "highlighted", null, () => runs.null++)
    store.set({ highlighted: "a" })
    expect(runs).toEqual({ a: 1, null: 1 })
  })

  test("listeners that skip keys hear a key named like an Object.prototype member", () => {
    const store = createStore(
      { constructor: 0, other: 0 } as { constructor: number; other: number },
      []
    )
    let runs = 0
    subscribeSkipping(store, { other: true }, () => runs++)
    store.set({ constructor: 1 })
    expect(runs).toBe(1)
  })

  test("a write while a view is read keeps the viewed state out of the store", () => {
    const store = createStore({ open: false, query: "" }, [])
    // A framework delivers `open: true` ahead of `set`.
    store.follow(() => ({ open: true }))
    // A render previews a query the store doesn't hold, and something it reads writes.
    store.view({ open: true, query: "preview" }, () =>
      store.set({ open: true })
    )
    expect(store.get()).toEqual({ open: true, query: "" })
  })

  test("listeners that skip keys miss only changes to those keys", () => {
    const store = createStore(
      { open: false, highlighted: null as string | null },
      []
    )
    const skip = { highlighted: true }
    let runs = 0
    subscribeSkipping(store, skip, () => runs++)
    store.set({ highlighted: "a" })
    store.set({ open: true })
    store.set({ open: false, highlighted: "b" })
    expect(runs).toBe(2)
  })

  test("listeners that hear every change run before those that skip or select", () => {
    const store = createStore(
      { open: false, highlighted: null as string | null },
      []
    )
    const order: string[] = []
    select(store, "highlighted", "a", () => order.push("selected"))
    subscribeSkipping(store, { open: true }, () => order.push("skipping"))
    store.subscribe(() => order.push("every change"))
    store.set({ highlighted: "a" })
    expect(order).toEqual(["every change", "skipping", "selected"])
  })

  test("listeners hear whether a change touched only live keys", () => {
    const store = createStore(
      { open: false, highlighted: null as string | null },
      ["highlighted"]
    )
    const heard: boolean[] = []
    select(store, "highlighted", "a", (liveOnly) => heard.push(liveOnly))
    subscribeSkipping(store, { highlighted: true }, (liveOnly) =>
      heard.push(liveOnly)
    )
    store.set({ highlighted: "a" })
    store.set({ open: true, highlighted: null })
    expect(heard).toEqual([true, false, false])
  })

  test("unsubscribing frees every listener", () => {
    // Every Map and Set the store makes, so the test can look inside them. The
    // garbage collector can't prove this: it may keep a dead listener a while.
    const made: (Map<unknown, unknown> | Set<unknown>)[] = []
    const { Map: BaseMap, Set: BaseSet } = globalThis
    globalThis.Map = class extends BaseMap<unknown, unknown> {
      constructor(entries?: Iterable<readonly [unknown, unknown]> | null) {
        super(entries)
        made.push(this)
      }
    } as MapConstructor
    globalThis.Set = class extends BaseSet<unknown> {
      constructor(values?: Iterable<unknown> | null) {
        super(values)
        made.push(this)
      }
    } as SetConstructor
    try {
      const store = createStore(
        { highlighted: null as string | null, panels: [] as string[] },
        ["highlighted"]
      )
      const skip = { highlighted: true }
      // Every part subscribes before any leaves, like a long list mounting.
      const cleanups = Array.from({ length: 100 }, (_, index) => {
        const listener = () => {}
        return [
          store.subscribe(listener),
          subscribeSkipping(store, skip, listener),
          select(store, "highlighted", `item-${index}`, listener),
          select(store, "panels", `item-${index}`, listener),
        ]
      }).flat()
      cleanups.forEach((cleanup) => cleanup())
    } finally {
      globalThis.Map = BaseMap
      globalThis.Set = BaseSet
    }
    // A listener, or a group kept once it's empty, would still be in one of them.
    const holding = made.filter((collection) =>
      [...collection.values()].some(
        (value) => typeof value === "function" || value instanceof BaseSet
      )
    )
    expect(made.length).toBeGreaterThan(0)
    expect(holding).toEqual([])
  })
})

describe("the render version", () => {
  const menu = definePrimitive({
    name: "menu",
    state: () => ({ open: false, highlighted: null as string | null }),
    live: ["highlighted"],
    api: (context) => ({
      set: (patch: { open?: boolean; highlighted?: string | null }) =>
        context.store.set(patch),
    }),
    slots: (slot) => ({ root: slot({}) }),
  })

  test("changes with state that renders, and not with live keys alone", () => {
    const instance = menu({ id: "m" })
    const before = renderVersion(instance)
    instance.api.set({ highlighted: "a" })
    expect(renderVersion(instance)).toBe(before)
    instance.api.set({ open: true })
    expect(renderVersion(instance)).toBeGreaterThan(before)
  })
})

describe("slot state comparison", () => {
  test("plain objects and arrays with the same values are the same, however deep", () => {
    expect(
      sameSlotState(
        { point: { x: 1 }, points: [{ x: 1 }] },
        { point: { x: 1 }, points: [{ x: 1 }] }
      )
    ).toBe(true)
    expect(sameSlotState({ point: { x: 1 } }, { point: { x: 2 } })).toBe(false)
    expect(sameSlotState([{ x: 1 }], [{ x: 1 }, { x: 2 }])).toBe(false)
    expect(sameSlotState({ x: 1 }, { x: 1, y: undefined })).toBe(false)
    expect(sameSlotState([], {})).toBe(false)
  })

  test("a list changed in place is never the same as another", () => {
    const item = { x: 1 }
    expect(sameSlotState([item], markChangedInPlace([item]))).toBe(false)
  })

  test("distinct cyclic objects and arrays compare without overflowing, and still see differences", () => {
    const cyclic = (x: number) => {
      const node: Record<string, unknown> = { x }
      node.self = node
      node.list = [node]
      return node
    }
    expect(sameSlotState(cyclic(1), cyclic(1))).toBe(true)
    expect(sameSlotState(cyclic(1), cyclic(2))).toBe(false)
    const ring = (x: number) => {
      const first: Record<string, unknown> = { x }
      const second: Record<string, unknown> = { x: x + 1, next: first }
      first.next = second
      return first
    }
    expect(sameSlotState(ring(1), ring(1))).toBe(true)
    const list: unknown[] = [1]
    list.push(list)
    const other: unknown[] = [1]
    other.push(other)
    expect(sameSlotState(list, other)).toBe(true)
    expect(sameSlotState({ list }, { list: [2, list] })).toBe(false)
  })

  test("other objects compare by identity", () => {
    expect(sameSlotState({ at: new Date(0) }, { at: new Date(0) })).toBe(false)
    expect(sameSlotState(new Map(), new Map())).toBe(false)
    const date = new Date(0)
    expect(sameSlotState({ at: date }, { at: date })).toBe(true)
  })
})
