// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { select } from "../src/components/select/select"
import { fuzzyScore } from "../src/foundation/text/fuzzy"
import type { ListItem } from "../src/foundation/lists/listbox-engine"
import type { OptionsOf } from "../src/foundation/kernel/primitive-types"
import { mount } from "../src/testing"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

const items = ["JavaScript", "Lava", "Java"]
const ranked = (item: ListItem<unknown>, query: string) => {
  const score = fuzzyScore(item.label ?? "", query)
  return score >= 0.6 ? score : 0
}

function comboboxOrder(options: OptionsOf<typeof combobox>) {
  const mounted = mount(
    combobox,
    options,
    "<root><input><content><list></list></content></root>"
  )
  mounts.push(mounted)
  mounted.api.internal.store.set({ open: true, dirty: true, query: "java" })
  return mounted.api.internal.listbox.entries().map((entry) => entry.value)
}

test("Combobox sorts items by a filter function's score, best first", () => {
  expect(comboboxOrder({ items, filter: ranked })).toEqual([
    "Java",
    "JavaScript",
  ])
})

test("Combobox keeps the source order for the built-in filters", () => {
  expect(comboboxOrder({ items })).toEqual(["JavaScript", "Java"])
})

test("Select sorts searched items by a filter function's score", () => {
  const mounted = mount(
    select,
    { items, filter: ranked },
    "<root><trigger></trigger><content><input><list></list></content></root>"
  )
  mounts.push(mounted)
  mounted.api.internal.store.set({
    open: true,
    searchable: true,
    query: "java",
  })
  expect(
    mounted.api.internal.listbox.entries().map((entry) => entry.value)
  ).toEqual(["Java", "JavaScript"])
})
