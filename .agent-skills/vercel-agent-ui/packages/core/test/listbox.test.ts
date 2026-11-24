import { afterEach, describe, expect, expectTypeOf, test, vi } from "vitest"
import { createAsyncOptions } from "../src/foundation/lists/async-options"
import {
  combobox,
  type ComboboxValueChangeReason,
} from "../src/components/combobox/combobox"
import {
  createFilteredListbox,
  filterData,
  flattenData,
  itemKey,
  itemMatches,
  textMatches,
  type ListData,
} from "../src/foundation/lists/listbox"
import type { ChangeDetails } from "../src/foundation/kernel/details"
import { createStore } from "../src/foundation/kernel/store"
import {
  createSelectController,
  select,
  type SelectOpenChangeReason,
} from "../src/components/select/select"

const fruits: ListData = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana", keywords: ["yellow"] },
  { type: "separator" },
  {
    type: "group",
    label: "Berries",
    items: [
      { value: "blueberry", label: "Blueberry" },
      { value: "cherry", label: "Cherry", disabled: true },
    ],
  },
  "Éclair",
]

describe("item keys", () => {
  test("strings pass through, objects use value or id, and itemToValue wins", () => {
    expect(itemKey("pro")).toBe("pro")
    expect(itemKey({ value: "pro", label: "Pro" })).toBe("pro")
    expect(itemKey({ id: 42, name: "Ada" })).toBe("42")
    expect(
      itemKey({ email: "a@b.c" }, (user) => (user as { email: string }).email)
    ).toBe("a@b.c")
    expect(itemKey(null)).toBe("")
  })
})

describe("filtering", () => {
  test("contains and startsWith ignore case and accents", () => {
    expect(textMatches("Éclair", "ecl", "startsWith")).toBe(true)
    expect(textMatches("Blueberry", "berry", "contains")).toBe(true)
    expect(textMatches("Blueberry", "berry", "startsWith")).toBe(false)
  })

  test("keywords match too", () => {
    expect(
      itemMatches(
        { value: "banana", label: "Banana", keywords: ["yellow"] },
        "yell",
        "contains"
      )
    ).toBe(true)
  })

  test("false keeps everything, and a function decides for itself", () => {
    expect(itemMatches({ value: "a", label: "Apple" }, "zzz", false)).toBe(true)
    expect(
      itemMatches(
        { value: "a", label: "Apple" },
        "zzz",
        (item, query) => query === "zzz"
      )
    ).toBe(true)
  })

  test("groups keep only matching items, and drop when empty", () => {
    expect(filterData(fruits, "blue", "contains")).toEqual([
      {
        type: "group",
        label: "Berries",
        items: [{ value: "blueberry", label: "Blueberry" }],
      },
    ])
  })

  test("separators stay only between kept entries", () => {
    const result = filterData(fruits, "a", "contains")
    expect(result.at(-1)).not.toEqual({ type: "separator" })
    expect(result[0]).not.toEqual({ type: "separator" })
  })

  test("a separator whose entries after it were all filtered out goes too", () => {
    const separator = { type: "separator" } as const
    const fruit: ListData = ["Apple", separator, "Banana", separator, "Cherry"]
    expect(filterData(fruit, "apple", "contains")).toEqual(["Apple"])
    const doubled: ListData = [
      separator,
      "Apple",
      separator,
      separator,
      "Avocado",
    ]
    expect(filterData(doubled, "a", "contains")).toEqual([
      "Apple",
      separator,
      "Avocado",
    ])
  })

  test("flattening keeps order and each item's group", () => {
    const flat = flattenData(fruits, (value) => itemKey(value))
    expect(flat.map((entry) => entry.key)).toEqual([
      "apple",
      "banana",
      "blueberry",
      "cherry",
      "Éclair",
    ])
    expect(flat[2].group).toBe(flat[3].group)
    expect(flat[3].disabled).toBe(true)
  })
})

describe("composed items", () => {
  // The fields the engine reads from an item's element.
  const element = () =>
    ({
      isConnected: true,
      parentNode: null,
      compareDocumentPosition: () => 4,
    }) as unknown as HTMLElement

  test("a list whose items all unmounted counts none, even when nothing filters", () => {
    const store = createStore({ highlighted: null as string | null }, [
      "highlighted",
    ])
    const listbox = createFilteredListbox({
      store,
      focus: "virtual",
      items: () => undefined,
      toKey: (value) => itemKey(value),
      filter: () => false,
      query: () => "zzz",
      loop: () => true,
      active: () => true,
    })
    const unregister = ["a", "b"].map((key) =>
      listbox.register(key, element(), () => ({ label: key, value: key }))
    )
    expect(listbox.count()).toBe(2)
    unregister.forEach((off) => off())
    expect(listbox.count()).toBe(0)
  })
})

describe("navigation over data", () => {
  const make = (loop = true, query = "", skipDisabled = false) => {
    const store = createStore({ highlighted: null as string | null }, [
      "highlighted",
    ])
    const listbox = createFilteredListbox({
      store,
      focus: "virtual",
      items: () => fruits,
      toKey: (value) => itemKey(value),
      filter: () => "contains",
      query: () => query,
      loop: () => loop,
      skipDisabled,
      active: () => true,
    })
    return { store, listbox }
  }

  test("moves through every item, disabled ones included, and wraps, without skipDisabled", () => {
    const { store, listbox } = make()
    listbox.move(1)
    expect(store.get().highlighted).toBe("apple")
    listbox.move("last")
    expect(store.get().highlighted).toBe("Éclair")
    listbox.move(1)
    expect(store.get().highlighted).toBe("apple")
    listbox.move(-1)
    listbox.move(-1)
    expect(store.get().highlighted).toBe("cherry")
  })

  test("stops at the ends without loop", () => {
    const { store, listbox } = make(false)
    listbox.move("last")
    listbox.move(1)
    expect(store.get().highlighted).toBe("Éclair")
  })

  test("with skipDisabled, steps pass over disabled items", () => {
    const { store, listbox } = make(true, "", true)
    listbox.move("last")
    listbox.move(-1)
    expect(store.get().highlighted).toBe("blueberry")
    listbox.move(1)
    expect(store.get().highlighted).toBe("Éclair")
  })

  test("with skipDisabled, a step from a disabled item counts from where it sits", () => {
    const { store, listbox } = make(false, "", true)
    store.set({ highlighted: "cherry" })
    listbox.move(-1)
    expect(store.get().highlighted).toBe("blueberry")
    store.set({ highlighted: "cherry" })
    listbox.move(1)
    expect(store.get().highlighted).toBe("Éclair")
  })

  test("with skipDisabled and nothing enabled, steps land nowhere", () => {
    const store = createStore({ highlighted: null as string | null }, [
      "highlighted",
    ])
    const listbox = createFilteredListbox({
      store,
      focus: "virtual",
      items: () => [
        { value: "a", label: "A", disabled: true },
        { value: "b", label: "B", disabled: true },
      ],
      toKey: (value) => itemKey(value),
      filter: () => "contains",
      query: () => "",
      loop: () => true,
      skipDisabled: true,
      active: () => true,
    })
    expect(listbox.stepKey(1)).toBeUndefined()
    expect(listbox.stepKey("last")).toBeUndefined()
    listbox.move(1)
    expect(store.get().highlighted).toBe(null)
  })

  test("with skipDisabled, the last enabled item counts as the end of the page", () => {
    const store = createStore({ highlighted: null as string | null }, [
      "highlighted",
    ])
    let reached = 0
    const listbox = createFilteredListbox({
      store,
      focus: "virtual",
      items: () => [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
        { value: "c", label: "C", disabled: true },
      ],
      toKey: (value) => itemKey(value),
      filter: () => "contains",
      query: () => "",
      loop: () => false,
      skipDisabled: true,
      active: () => true,
      onLastReached: () => reached++,
    })
    listbox.move("last")
    expect(store.get().highlighted).toBe("b")
    expect(reached).toBe(1)
  })

  test("a page step wraps in a list shorter than the page", () => {
    const { store, listbox } = make(true, "", true)
    listbox.move(1)
    listbox.move(-10)
    expect(store.get().highlighted).not.toBe(null)
  })

  test("typeahead skips disabled items", () => {
    const { listbox } = make()
    expect(listbox.search("c", null)).toBeUndefined()
    listbox.resetTyping()
    expect(listbox.search("b", "banana")?.key).toBe("blueberry")
  })

  test("typeahead from a disabled item finds the next match after it", () => {
    const store = createStore({ highlighted: null as string | null }, [
      "highlighted",
    ])
    const listbox = createFilteredListbox({
      store,
      focus: "virtual",
      items: () => [
        { value: "apple", label: "Apple" },
        { value: "avocado", label: "Avocado", disabled: true },
        { value: "banana", label: "Banana" },
        { value: "apricot", label: "Apricot" },
      ],
      toKey: (value) => itemKey(value),
      filter: () => "contains",
      query: () => "",
      loop: () => true,
      active: () => true,
    })
    expect(listbox.search("a", "avocado")?.key).toBe("apricot")
  })

  test("moves only through items that match the query", () => {
    const { store, listbox } = make(true, "berry")
    listbox.move("first")
    expect(store.get().highlighted).toBe("blueberry")
    expect(listbox.entries()).toHaveLength(1)
  })

  test("labels come from data without anything mounted", () => {
    const { listbox } = make()
    expect(listbox.labelOf("blueberry")).toBe("Blueberry")
    expect(listbox.labelOf("missing")).toBeUndefined()
    listbox.remember("missing", "Gone", "missing")
    expect(listbox.labelOf("missing")).toBe("Gone")
  })

  test("a remembered item made again with the same label keeps its new value", () => {
    const { listbox } = make()
    listbox.remember("missing", "Gone", { id: "missing", version: 1 })
    listbox.remember("missing", "Gone", { id: "missing", version: 2 })
    expect(listbox.valueOf("missing")).toEqual({ id: "missing", version: 2 })
  })

  test("a remembered item's new label or keywords reach the filter", () => {
    const { listbox } = make()
    listbox.remember("missing", "Gone", "missing", ["away"])
    const version = listbox.labelsVersion()
    listbox.remember("missing", "Gone", "missing", ["away"])
    expect(listbox.labelsVersion()).toBe(version)
    listbox.remember("missing", "Gone", "missing", ["elsewhere"])
    expect(listbox.labelsVersion()).toBe(version + 1)
    listbox.remember("missing", "Lost", "missing", ["elsewhere"])
    expect(listbox.labelsVersion()).toBe(version + 2)
    expect(listbox.labelOf("missing")).toBe("Lost")
  })

  test("10,000 items: moving and filtering stay well under a frame", () => {
    const many: ListData = Array.from({ length: 10_000 }, (_, index) => ({
      value: `item-${index}`,
      label: `Item ${index}`,
    }))
    let query = ""
    const store = createStore({ highlighted: null as string | null }, [
      "highlighted",
    ])
    const listbox = createFilteredListbox({
      store,
      focus: "virtual",
      items: () => many,
      toKey: (value) => itemKey(value),
      filter: () => "contains",
      query: () => query,
      loop: () => true,
      active: () => true,
    })
    listbox.entries()
    let start = performance.now()
    for (let step = 0; step < 100; step++) {
      listbox.move(1)
    }
    const move = (performance.now() - start) / 100
    start = performance.now()
    query = "99"
    const filtered = listbox.entries().length
    const filter = performance.now() - start
    expect(filtered).toBe(280)
    expect(move).toBeLessThan(4)
    expect(filter).toBeLessThan(50)
  })
})

describe("select and combobox headless", () => {
  test("a select opens, chooses an item and closes with reasons", () => {
    const onValueChange = vi.fn()
    const onOpenChange = vi.fn()
    const instance = select({
      id: "s",
      items: fruits,
      onValueChange,
      onOpenChange,
    })
    const api = instance.api
    api.open()
    expect(onOpenChange).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ reason: "imperative" })
    )
    api.internal.choose("banana")
    expect(onValueChange).toHaveBeenLastCalledWith(
      "banana",
      expect.objectContaining({ reason: "item-press" })
    )
    expect(api.isOpen()).toBe(false)
    expect(api.internal.labels()).toEqual(["Banana"])
  })

  test("a multiple select toggles values and stays open", () => {
    const instance = select({ id: "s", items: fruits, multiple: true })
    const api = instance.api
    api.open()
    api.internal.choose("apple")
    api.internal.choose("banana")
    api.internal.choose("apple")
    expect(api.getValue()).toEqual(["banana"])
    expect(api.isOpen()).toBe(true)
  })

  test("disabled items can't be chosen, and a form reset returns to the default", () => {
    const instance = select({ id: "s", items: fruits, defaultValue: "apple" })
    const api = instance.api
    api.internal.choose("cherry")
    expect(api.getValue()).toBe("apple")
    api.setValue("banana")
    api.internal.reset()
    expect(api.getValue()).toBe("apple")
  })

  test("the label of a value outside the items comes from itemToLabel", () => {
    const instance = select({
      id: "s",
      items: [],
      defaultValue: { id: 7, name: "Grace" },
      itemToLabel: (user: { name: string }) => user.name,
    })
    expect(instance.api.internal.labels()).toEqual(["Grace"])
  })

  test("a combobox filters by its text and puts the label in it when an item is chosen", () => {
    const onQueryChange = vi.fn()
    const instance = combobox({ id: "c", items: fruits, onQueryChange })
    const api = instance.api
    api.setQuery("bl")
    expect(api.internal.listbox.entries().map((entry) => entry.key)).toEqual([
      "blueberry",
    ])
    api.open()
    api.internal.choose("blueberry")
    expect(api.getValue()).toBe("blueberry")
    expect(api.getQuery()).toBe("Blueberry")
    expect(onQueryChange).toHaveBeenLastCalledWith(
      "Blueberry",
      expect.objectContaining({ reason: "item-press" })
    )
    // The chosen label shows every item until the user types again.
    expect(api.internal.listbox.entries()).toHaveLength(5)
  })

  test("a controlled value shows its label as the options land, and onQueryChange still hears it", () => {
    const onQueryChange = vi.fn()
    const instance = combobox({
      id: "c",
      items: fruits,
      value: "apple",
      onQueryChange,
    })
    const queries: string[] = []
    instance.subscribe(() => queries.push(instance.api.getQuery()))
    instance.setOptions({
      id: "c",
      items: fruits,
      value: "blueberry",
      onQueryChange,
    })
    expect(instance.api.getQuery()).toBe("Blueberry")
    expect(queries.every((query) => query === "Blueberry")).toBe(true)
    expect(onQueryChange).toHaveBeenCalledOnce()
    expect(onQueryChange).toHaveBeenLastCalledWith(
      "Blueberry",
      expect.objectContaining({ reason: "imperative" })
    )
  })

  test("a value and items that change together show the label from the new items", () => {
    const onQueryChange = vi.fn()
    const before = [
      { value: "a", label: "Apple" },
      { value: "b", label: "Banana" },
    ]
    const after = [
      { value: "a", label: "Apricot" },
      { value: "b", label: "Blackberry" },
    ]
    const instance = combobox({
      id: "c",
      items: before,
      value: "a",
      onQueryChange,
    })
    instance.setOptions({ id: "c", items: after, value: "b", onQueryChange })
    expect(instance.api.getQuery()).toBe("Blackberry")
    expect(onQueryChange).toHaveBeenLastCalledWith(
      "Blackberry",
      expect.objectContaining({ reason: "imperative" })
    )
  })

  test("a multiple combobox empties its text after each choice and respects maxSelected", () => {
    const instance = combobox({
      id: "c",
      items: fruits,
      multiple: true,
      maxSelected: 2,
    })
    const api = instance.api
    api.open()
    api.setQuery("a")
    api.internal.choose("apple")
    expect(api.getQuery()).toBe("")
    api.internal.choose("banana")
    api.internal.choose("blueberry")
    expect(api.getValue()).toEqual(["apple", "banana"])
    expect(api.internal.maxReached()).toBe(true)
  })

  test("allowCustomValue keeps typed text as the value when the list closes", () => {
    const single = combobox({ id: "c", items: fruits, allowCustomValue: true })
    single.api.open()
    single.api.setQuery("Kiwi")
    single.api.close()
    expect(single.api.getValue()).toBe("Kiwi")
    expect(single.api.getQuery()).toBe("Kiwi")
    const plain = combobox({ id: "d", items: fruits })
    plain.api.open()
    plain.api.setQuery("Kiwi")
    plain.api.close()
    expect(plain.api.getValue()).toBe(null)
    expect(plain.api.getQuery()).toBe("")
  })

  test("the create option hides on an exact match and respects minLength", () => {
    const instance = combobox({ id: "c", items: fruits })
    const api = instance.api
    const state = () =>
      instance.get() as Parameters<typeof api.internal.createShown>[0]
    api.setQuery("apple")
    expect(api.internal.createShown(state())).toBe(false)
    api.setQuery("kiwi")
    expect(api.internal.createShown(state())).toBe(true)
  })
})

describe("select and combobox controller results", () => {
  test("a select's open() resolves with how the list closed", async () => {
    const instance = select({ id: "s", items: fruits })
    const result = instance.api.open()
    instance.api.internal.choose("apple")
    expect(await result).toEqual({
      reason: "item-press",
      source: "programmatic",
    })
  })

  test("a pending open() resolves with reason unmount when the select leaves the page", async () => {
    const reasons: string[] = []
    const instance = select({
      id: "s",
      items: fruits,
      onOpenChange: (_, { reason }) => reasons.push(reason),
    })
    const result = instance.api.open()
    instance.destroy()
    expect(await result).toEqual({ reason: "unmount", source: "programmatic" })
    expect(reasons).toEqual(["imperative"])
  })

  test("an aborted signal closes a combobox with reason imperative", async () => {
    const instance = combobox({ id: "c", items: fruits })
    const abort = new AbortController()
    const result = instance.api.open({ signal: abort.signal })
    expect(instance.api.isOpen()).toBe(true)
    abort.abort()
    expect(instance.api.isOpen()).toBe(false)
    expect((await result).reason).toBe("imperative")
  })

  test("an already aborted signal never opens a combobox", async () => {
    const instance = combobox({ id: "c", items: fruits })
    const result = await instance.api.open({ signal: AbortSignal.abort() })
    expect(result).toEqual({ reason: "imperative", source: "programmatic" })
    expect(instance.api.isOpen()).toBe(false)
  })

  test("a refused open resolves at once with the reason it asked with", async () => {
    const instance = select({
      id: "s",
      items: fruits,
      onOpenChange: (_, details) => details.cancel(),
    })
    expect(await instance.api.open({ reason: "trigger-press" })).toEqual({
      reason: "trigger-press",
      source: "programmatic",
    })
  })

  test("results and details are typed by the component's reasons", () => {
    const controller = createSelectController()
    type Result = Awaited<ReturnType<typeof controller.open>>
    expectTypeOf<Result["reason"]>().toEqualTypeOf<
      SelectOpenChangeReason | "unmount"
    >()
    const check = (details: ChangeDetails<ComboboxValueChangeReason>) => {
      if (details.reason === "remove-press") {
        expectTypeOf(details.event).toEqualTypeOf<
          MouseEvent | KeyboardEvent | undefined
        >()
      }
    }
    expect(check).toBeTypeOf("function")
  })

  test("change details carry a source", () => {
    const onValueChange = vi.fn()
    const instance = combobox({ id: "c", items: fruits, onValueChange })
    instance.api.setValue("apple")
    expect(onValueChange).toHaveBeenLastCalledWith(
      "apple",
      expect.objectContaining({
        reason: "imperative",
        source: "programmatic",
        canceled: false,
      })
    )
  })
})

describe("async options", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("waits for typing to pause and lands only the latest answer", async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const options = createAsyncOptions(
      (query, { signal }) =>
        new Promise<string[]>((resolve) => {
          calls.push(query)
          const timer = setTimeout(
            () => resolve([`${query}-result`]),
            query === "a" ? 500 : 100
          )
          signal.addEventListener("abort", () => clearTimeout(timer))
        }),
      { debounce: 200 }
    )
    options.setQuery("a")
    await vi.advanceTimersByTimeAsync(250)
    expect(options.getState().status).toBe("loading")
    options.setQuery("ab")
    await vi.advanceTimersByTimeAsync(100)
    options.setQuery("abc")
    await vi.advanceTimersByTimeAsync(400)
    expect(calls).toEqual(["a", "abc"])
    expect(options.getState()).toMatchObject({
      query: "abc",
      items: ["abc-result"],
      status: "idle",
    })
  })

  test("reports loading while typing pauses, before the load starts", async () => {
    vi.useFakeTimers()
    const options = createAsyncOptions(async (query) => [query], {
      debounce: 200,
    })
    options.setQuery("b")
    expect(options.getState().status).toBe("loading")
    await vi.advanceTimersByTimeAsync(250)
    expect(options.getState()).toMatchObject({ items: ["b"], status: "idle" })
    options.setQuery("ba")
    options.cancel()
    expect(options.getState().status).toBe("idle")
  })

  test("keeps the last items while loading, reports errors, and loads more pages", async () => {
    vi.useFakeTimers()
    let fail = false
    const options = createAsyncOptions(
      async (query, { page }) => {
        if (fail) {
          throw new Error("offline")
        }
        return { items: [`${query}-${page}`], hasMore: page < 1 }
      },
      { debounce: 0 }
    )
    options.setQuery("x")
    await vi.advanceTimersByTimeAsync(1)
    expect(options.getState().items).toEqual(["x-0"])
    options.loadMore()
    await vi.advanceTimersByTimeAsync(1)
    expect(options.getState()).toMatchObject({
      items: ["x-0", "x-1"],
      hasMore: false,
    })
    fail = true
    options.setQuery("y")
    await vi.advanceTimersByTimeAsync(0)
    expect(options.getState().items).toEqual(["x-0", "x-1"])
    await vi.advanceTimersByTimeAsync(1)
    expect(options.getState().status).toBe("error")
  })
})
