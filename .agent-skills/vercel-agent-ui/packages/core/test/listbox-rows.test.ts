import { afterEach, describe, expect, test, vi } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { comboboxSelectAll } from "../src/components/combobox/combobox-parts"
import { chipsThatFit } from "../src/components/combobox/combobox-chips"
import {
  createFilteredListbox,
  itemKey,
  type ListData,
} from "../src/foundation/lists/listbox"
import { createLoadMore } from "../src/foundation/lists/listbox-search"
import { selectAllKey } from "../src/foundation/lists/listbox-keys"
import { createStore } from "../src/foundation/kernel/store"
import { select } from "../src/components/select/select"
import { selectSelectAll } from "../src/components/select/select-parts"
import { formatLabels } from "../src/foundation/lists/listbox-value"
import { partState } from "../src/foundation/kernel/part"

const fruits: ListData = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
  { value: "orange", label: "Orange" },
]

const recent: ListData = [
  {
    type: "group",
    label: "Recent",
    items: [{ value: "orange", label: "Orange" }],
  },
]

describe("items shown while the query is empty", () => {
  const make = (query = "") => {
    const store = createStore({ highlighted: null as string | null }, [
      "highlighted",
    ])
    const state = { query }
    const listbox = createFilteredListbox({
      store,
      focus: "virtual",
      items: () => fruits,
      emptyItems: () => recent,
      toKey: (value) => itemKey(value),
      filter: () => "contains",
      query: () => state.query,
      loop: () => true,
      active: () => true,
    })
    return { listbox, state }
  }

  test("show instead of the items while the query is empty, and the items once it isn't", () => {
    const { listbox, state } = make()
    expect(listbox.visibleData()?.list).toBe(recent)
    expect(listbox.entries().map((entry) => entry.key)).toEqual(["orange"])
    state.query = "an"
    expect(listbox.entries().map((entry) => entry.key)).toEqual([
      "banana",
      "orange",
    ])
  })

  test("labels come from both, whatever shows", () => {
    const { listbox, state } = make()
    expect(listbox.labelOf("apple")).toBe("Apple")
    state.query = "zzz"
    expect(listbox.labelOf("orange")).toBe("Orange")
  })

  test("a combobox shows them while its input is empty, not while it shows the chosen label", () => {
    const instance = combobox({
      id: "c",
      items: fruits,
      emptyItems: recent,
      defaultValue: "apple",
    })
    const keys = () =>
      instance.api.internal.listbox.entries().map((entry) => entry.key)
    expect(keys()).toEqual(["apple", "banana", "cherry", "orange"])
    instance.api.setQuery("")
    expect(keys()).toEqual(["orange"])
  })
})

describe("select all", () => {
  test("selects every item that matches and can be chosen, then clears them", () => {
    const instance = combobox({ id: "c", items: fruits, multiple: true })
    // The select-all part registers its feature when it renders.
    instance.use(comboboxSelectAll)
    const { api } = instance
    api.open()
    api.internal.choose(selectAllKey())
    expect(api.getValue()).toEqual(["apple", "banana", "orange"])
    api.internal.choose(selectAllKey())
    expect(api.getValue()).toEqual([])
  })

  test("covers only what the text matches, and keeps what else was selected", () => {
    const instance = combobox({
      id: "c",
      items: fruits,
      multiple: true,
      defaultValue: ["apple"],
    })
    instance.use(comboboxSelectAll)
    const { api } = instance
    api.open()
    api.setQuery("an")
    api.internal.choose(selectAllKey())
    expect(api.getValue()).toEqual(["apple", "banana", "orange"])
  })

  test("is indeterminate while some are selected, and disabled when choosing all would pass maxSelected", () => {
    const instance = select({
      id: "s",
      items: fruits,
      multiple: true,
      defaultValue: ["banana"],
    })
    instance.use(selectSelectAll)
    const state = () =>
      partState(instance.part("select-all", { id: selectAllKey() }))
    expect(state()).toMatchObject({ checked: false, indeterminate: true })
    instance.api.internal.choose(selectAllKey())
    expect(state()).toMatchObject({ checked: true, indeterminate: false })
    const limited = combobox({
      id: "c",
      items: fruits,
      multiple: true,
      maxSelected: 2,
    })
    limited.use(comboboxSelectAll)
    expect(
      partState(limited.part("select-all", { id: selectAllKey() })).disabled
    ).toBe(true)
    limited.api.internal.choose(selectAllKey())
    expect(limited.api.getValue()).toEqual([])
  })
})

describe("labels as a list", () => {
  test("joins with commas without maxLabels, and counts the rest in the page's language with it", () => {
    expect(formatLabels(["Apple", "Banana", "Orange"])).toBe(
      "Apple, Banana, Orange"
    )
    expect(
      formatLabels(["Apple", "Banana", "Orange", "Pear"], { maxLabels: 2 })
    ).toBe("Apple, Banana, and 2 more")
    expect(formatLabels(["Apple", "Banana"], { maxLabels: 2 })).toBe(
      "Apple and Banana"
    )
    expect(
      formatLabels(["Apple", "Banana", "Pear"], {
        maxLabels: 1,
        getMoreLabel: (n) => `+${n}`,
      })
    ).toBe("Apple and +2")
  })
})

describe("chips that fit", () => {
  const base = { available: 300, gap: 4, overflow: 40, reserve: 60 }

  test("all fit without room for the overflow part", () => {
    expect(chipsThatFit({ ...base, widths: [70, 70, 80] })).toBe(3)
  })

  test("those that fit beside the overflow part and the input, when some don't", () => {
    expect(chipsThatFit({ ...base, widths: [70, 70, 80, 60] })).toBe(2)
    expect(chipsThatFit({ ...base, widths: [250, 20] })).toBe(0)
  })

  test("a chip never measured shows when everything before it fits, so it can be measured", () => {
    expect(chipsThatFit({ ...base, widths: [70, undefined] })).toBe(2)
    expect(chipsThatFit({ ...base, widths: [70, 70, 80, undefined] })).toBe(2)
  })
})

describe("loading more", () => {
  afterEach(() => vi.restoreAllMocks())

  test("asks once per page, never while loading, and again after a failure", () => {
    const onLoadMore = vi.fn()
    let count = 20
    let status: "idle" | "loading" | "error" = "idle"
    const more = createLoadMore({
      count: () => count,
      status: () => status,
      onLoadMore: () => onLoadMore,
    })
    more.reached()
    more.reached()
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    status = "loading"
    count = 40
    more.reached()
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    status = "idle"
    more.reached()
    expect(onLoadMore).toHaveBeenCalledTimes(2)
    status = "error"
    more.reached()
    expect(onLoadMore).toHaveBeenCalledTimes(3)
  })

  test("the highlight reaching the last item asks for more", () => {
    const onLoadMore = vi.fn()
    const instance = combobox({ id: "c", items: fruits, onLoadMore })
    instance.api.open()
    instance.api.internal.listbox.move("last")
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })
})
