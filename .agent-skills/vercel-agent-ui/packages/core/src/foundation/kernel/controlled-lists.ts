// Lists a parent hands over, like a selected `value`, a tree's `expanded` or
// the `items` data, as the Vue, Svelte and Solid renderers hand them over.
// React state and custom element properties are replaced rather than changed
// in place, so their renderers hand lists over as they are.
import { callbackName, defaultName } from "./option-names"
import { schemaOf } from "./primitive"
import type { Primitive } from "./primitive-types"
import { isPlainObject, markChangedInPlace, sameValue } from "./store"

/**
 * A framework's cached derivation, like a Vue `computed`, a Svelte
 * `$derived` or a Solid `createMemo`: it runs `compute` again only once
 * something it read changed, and tells what reads it only when the result is
 * another value.
 */
type Memo = <Value>(compute: () => Value) => () => Value

const keysByPrimitive = new WeakMap<
  Primitive,
  { controlled: string[]; data: string[] }
>()

// The options that hold state a parent controls: those with a `default<Key>`
// or an `on<Key>Change` beside them. The others that can hold a list, apart
// from a controlled list's default, hold data, like `items`.
function keysOf(primitive: Primitive) {
  let keys = keysByPrimitive.get(primitive)
  if (keys) {
    return keys
  }
  const options = schemaOf(primitive).options
  const controlled = Object.keys(options).filter(
    (key) =>
      defaultName(key) in options || callbackName(key, "Change") in options
  )
  const defaults = new Set(controlled.map(defaultName))
  const data = Object.keys(options).filter((key) => {
    const spec = options[key]
    const kind = typeof spec === "object" ? spec.kind : spec
    return (
      (kind === "value" || kind === "list") &&
      !controlled.includes(key) &&
      !defaults.has(key)
    )
  })
  keys = { controlled, data }
  keysByPrimitive.set(primitive, keys)
  return keys
}

// Reads every item of a list, and every field of each through arrays and
// plain objects, so the framework tracks a change anywhere in it, like a
// child pushed into a tree's branch. Other objects, like dates, stay unread.
// `path` holds the arrays and objects it's inside, so a cycle ends; it's as
// short as the data is deep, which keeps a long list cheaper than a set of
// every item would.
function readAll(value: unknown, path: object[]) {
  if (typeof value !== "object" || value === null || path.includes(value)) {
    return
  }
  path.push(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      readAll(value[index], path)
    }
  } else if (isPlainObject(value)) {
    for (const key in value) {
      readAll(value[key], path)
    }
  }
  path.pop()
}

// A memo that reads every item of one data list. It runs again only once the
// framework says something in the list changed, and then hands over a copy, so
// the instance compares a new list. A list left alone keeps its identity, and
// with it what the instance keeps by it, like a listbox's flattened items.
function trackList(list: readonly unknown[], memo: Memo) {
  let read = false
  return memo(() => {
    readAll(list, [])
    if (!read) {
      read = true
      return list
    }
    return markChangedInPlace([...list])
  })
}

/**
 * Makes, for one instance, a function that replaces the lists in the options
 * a renderer is about to hand over with ones the instance can compare. A Vue
 * `reactive`, Svelte `$state` or Solid store array pushed into is still the
 * same array: handed over as it is, the framework never tracks its items and
 * the instance compares it with itself. A list a parent controls is copied as
 * the options are made, which reads every item, so the framework hands the
 * options over again when one changes, and while it holds the same items
 * every call returns the same copy. A data list like `items` can be long and
 * nested, so a `memo` made for each array reads it apart from the options: a
 * prop changing elsewhere reads none of its items, and the framework checks
 * none of them.
 */
function createListSnapshots(primitive: Primitive, memo: Memo) {
  const keys = keysOf(primitive)
  const snapshots: Record<string, unknown[]> = {}
  const trackers: Record<
    string,
    { list: readonly unknown[]; handed: () => readonly unknown[] }
  > = {}
  return <Options extends object>(options: Options) => {
    // Options are read by key, whatever primitive they're for.
    const given = options as Record<string, unknown>
    let swapped: Record<string, unknown> | undefined
    for (const key of keys.controlled) {
      const list = given[key]
      if (!Array.isArray(list)) {
        continue
      }
      // Copied before comparing: a Vue `reactive` array then tracks one
      // dependency for its items, not one per index.
      const items = [...list]
      let snapshot = snapshots[key]
      if (!snapshot || !sameValue(snapshot, items)) {
        snapshots[key] = snapshot = items
      }
      swapped ??= { ...given }
      swapped[key] = snapshot
    }
    for (const key of keys.data) {
      const list = given[key]
      if (!Array.isArray(list)) {
        delete trackers[key]
        continue
      }
      let tracker = trackers[key]
      if (tracker?.list !== list) {
        trackers[key] = tracker = { list, handed: trackList(list, memo) }
      }
      const handed = tracker.handed()
      if (handed === list) {
        continue
      }
      swapped ??= { ...given }
      swapped[key] = handed
    }
    return (swapped ?? options) as Options
  }
}

export { createListSnapshots }
