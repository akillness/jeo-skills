// @vitest-environment jsdom
// A list restored from saved keys before its object items arrive takes their
// values once they do, unless something newer set the value first.
import { describe, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { listbox } from "../src/components/listbox/listbox-root"
import { select } from "../src/components/select/select"

type Item = { id: number; name: string }

const one = { id: 1, name: "One" }
const two = { id: 2, name: "Two" }
const first = [{ value: one, label: "One" }]
const second = [{ value: two, label: "Two" }]
const both = [...first, ...second]

const itemToValue = (item: Item) => String(item.id)

type ListOptions = {
  multiple: boolean
  items?: typeof both
  onValueChange?: (
    value: unknown,
    details: { reason: string; cancel: () => void }
  ) => void
}

const lists = [
  [
    "select",
    (options: ListOptions) => select({ id: "select", itemToValue, ...options }),
  ],
  [
    "combobox",
    (options: ListOptions) =>
      combobox({ id: "combobox", itemToValue, ...options }),
  ],
  [
    "listbox",
    (options: ListOptions) =>
      listbox({ id: "listbox", itemToValue, ...options }),
  ],
] as const

const flush = () => Promise.resolve()

for (const [name, create] of lists) {
  for (const multiple of [false, true]) {
    describe(`a ${name}, multiple: ${multiple}`, () => {
      const shaped = (...values: unknown[]) =>
        multiple ? values : (values[0] ?? null)
      const restored = (keys: string[], options: Partial<ListOptions> = {}) => {
        const instance = create({ multiple, ...options })
        instance.api.internal.restore(JSON.stringify(keys))
        return instance
      }
      const supply = (
        instance: ReturnType<typeof create>,
        items: typeof both,
        more?: Partial<ListOptions>
      ) => {
        instance.setOptions({ id: name, itemToValue, multiple, items, ...more })
        return flush()
      }

      test("restored before its items arrive takes the items' values", async () => {
        const instance = restored(["2"])
        await supply(instance, both)
        expect(instance.get().value).toEqual(shaped(two))
      })

      test("submits the saved keys while their items haven't arrived", () => {
        const instance = restored(["2"])
        expect(instance.api.internal.serialized()).toEqual(["2"])
      })

      test("keeps a canceled restore canceled once the items arrive", async () => {
        const onValueChange: ListOptions["onValueChange"] = (_, details) => {
          if (details.reason === "restore") {
            details.cancel()
          }
        }
        const instance = restored(["2"], { onValueChange })
        await supply(instance, both, { onValueChange })
        expect(instance.get().value).toEqual(shaped())
      })

      test("keeps a value a callback set during the restore once the items arrive", async () => {
        const instance = create({
          multiple,
          onValueChange: (_, details) => {
            if (details.reason === "restore") {
              instance.api.setValue(shaped(one))
            }
          },
        })
        instance.api.internal.restore(JSON.stringify(["2"]))
        await supply(instance, both)
        expect(instance.get().value).toEqual(shaped(one))
      })

      test("keeps a newer write of the same value once the items arrive", async () => {
        const instance = restored(["2"])
        instance.api.setValue(shaped("2"))
        await supply(instance, both)
        expect(instance.get().value).toEqual(shaped("2"))
      })

      test("keeps a newer write of another value once the items arrive", async () => {
        const instance = restored(["2"])
        instance.api.setValue(shaped(one))
        await supply(instance, both)
        expect(instance.get().value).toEqual(shaped(one))
      })

      test("keeps a form reset once the items arrive", async () => {
        const instance = restored(["2"])
        instance.api.internal.reset()
        await supply(instance, both)
        expect(instance.get().value).toEqual(shaped())
      })

      test("stops waiting for the items once destroyed", async () => {
        const instance = restored(["2"])
        instance.destroy()
        await supply(instance, both)
        expect(instance.get().value).toEqual(shaped("2"))
      })

      if (multiple) {
        test("keeps the items already restored as the rest arrive", async () => {
          const instance = restored(["1", "2"], { items: first })
          await supply(instance, second)
          expect(instance.get().value).toEqual([one, two])
        })
      } else {
        test("waits only for the first saved key", async () => {
          const instance = restored(["1", "2"])
          await supply(instance, first)
          expect(instance.get().value).toEqual(one)
        })
      }
    })
  }
}

test("a combobox shows its restored item's label as the item arrives, with no query change", async () => {
  const heard: string[] = []
  const options = {
    id: "combobox",
    itemToValue,
    onQueryChange: (query: string, details: { cancel: () => void }) => {
      heard.push(query)
      details.cancel()
    },
  }
  const instance = combobox(options)
  instance.api.internal.restore(JSON.stringify(["2"]))
  heard.length = 0
  instance.setOptions({ ...options, items: both })
  await flush()
  expect(instance.get().query).toBe("Two")
  expect(heard).toEqual([])
})
