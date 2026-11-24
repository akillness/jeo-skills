// A change made from inside an `on<Key>Change` or `on<Key>Commit` callback
// is the one that stands, and it reports the interaction behind it.
import { expect, test } from "vitest"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import {
  createChange,
  createCommit,
} from "../src/foundation/kernel/input-source"

const counter = definePrimitive({
  name: "counter",
  options: { defaultValue: "number", onValueChange: "callback" },
  state: (options: {
    defaultValue?: number
    onValueChange?: (value: number) => void
  }) => ({
    value: options.defaultValue ?? 0,
  }),
  api: (context) => {
    const change = createChange(context)
    return {
      set: (value: number) =>
        change("value", value, { reason: "imperative" as never }),
    }
  },
  slots: () => ({}),
})

test("a change made inside on<Key>Change stands over the change that called it", () => {
  const instance = counter({
    id: "clamped",
    onValueChange: (value) => {
      if (value > 10) {
        instance.api.set(10)
      }
    },
  })
  instance.api.set(50)
  expect(instance.get().value).toBe(10)
})

test("a change back to the value the state holds, from inside on<Key>Change, stands too", () => {
  const instance = counter({
    id: "kept",
    defaultValue: 10,
    onValueChange: (value) => {
      if (value > 10) {
        instance.api.set(10)
      }
    },
  })
  instance.api.set(50)
  expect(instance.get().value).toBe(10)
})

test("asking for the same value from inside on<Key>Change, like a view rendering it back, is the same change", () => {
  const seen: number[] = []
  const instance = counter({
    id: "echoed",
    onValueChange: (value) => {
      seen.push(value)
      instance.api.set(value)
    },
  })
  instance.api.set(5)
  expect(seen).toEqual([5])
  expect(instance.get().value).toBe(5)
})

test("a change inside on<Key>Change to another key leaves the outer change in place", () => {
  const pair = definePrimitive({
    name: "pair",
    options: { onValueChange: "callback" },
    state: (_: { onValueChange?: (value: number) => void }) => ({
      value: 0,
      other: 0,
    }),
    api: (context) => {
      const change = createChange(context)
      return {
        set: (value: number) =>
          change("value", value, { reason: "imperative" as never }),
        setOther: (other: number) =>
          change("other", other, { reason: "imperative" as never }),
      }
    },
    slots: () => ({}),
  })
  const instance = pair({
    id: "pair",
    onValueChange: (value) => instance.api.setOther(value * 2),
  })
  instance.api.set(3)
  expect(instance.get()).toEqual({ value: 3, other: 6 })
})

test("changes made from on<Key>Change and on<Key>Commit report the interaction's source alike", () => {
  const sources: string[] = []
  const pressable = definePrimitive({
    name: "pressable",
    options: { onValueChange: "callback" },
    state: (_: {
      onValueChange?: (value: number, details: { source: string }) => void
    }) => ({ value: 0 }),
    api: (context) => {
      const change = createChange(context)
      return {
        set: (value: number) =>
          change("value", value, { reason: "press" as never }),
      }
    },
    slots: () => ({}),
  })
  const target = pressable({
    id: "target",
    onValueChange: (_, details) => sources.push(details.source),
  })
  const slider = definePrimitive({
    name: "slider",
    options: { onValueChange: "callback", onValueCommit: "callback" },
    state: (_: {
      onValueChange?: (value: number) => void
      onValueCommit?: (value: number) => void
    }) => ({
      value: 0,
    }),
    api: (context) => {
      const change = createChange(context, () => "keyboard")
      const commit = createCommit(context, () => "keyboard")
      return {
        step: (value: number) =>
          change("value", value, { reason: "step-key" as never }),
        commit: () =>
          commit("value", context.store.get().value, {
            reason: "step-key" as never,
          }),
      }
    },
    slots: () => ({}),
  })
  const instance = slider({
    id: "slider",
    onValueChange: (value) => target.api.set(value),
    onValueCommit: (value) => target.api.set(value + 100),
  })
  instance.api.step(5)
  instance.api.commit()
  expect(sources).toEqual(["keyboard", "keyboard"])
})
