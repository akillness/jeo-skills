// Parts that hear only the changes that can affect them: a highlight change
// reaches the two items it moves between, not every item. Parts that select
// values hear through their store's fanout, installed here the first time one
// subscribes, which runs after the component's own listeners and the parts
// that skip keys.
import { view } from "./part"
import type { Part } from "./primitive-types"
import { join, subscribeSkipping, type Listener, type Store } from "./store"

// What a part selects on for a key: an item of an array, an entry's name in a
// plain object, or the value itself. An array or object key may be null or
// undefined while it's empty.
type Selected<State, Key extends keyof State> =
  NonNullable<State[Key]> extends readonly (infer Item)[]
    ? Item
    : NonNullable<State[Key]> extends Record<string, unknown>
      ? string
      : State[Key]

/**
 * Reads a key no part can compare its own value with, like a grid's active
 * cell, by name: `values` names what a part reads, and `moved` names what a
 * change reaches, or returns `true` to reach every part that reads the key.
 */
type Reader<Value, View> = {
  values: (part: View) => readonly string[]
  moved: (
    previous: Value,
    next: Value,
    notify: (name: string) => void
  ) => boolean | void
}

type Reads<State, Api, Props> = {
  [Key in keyof State]?:
    | readonly Selected<State, Key>[]
    | ((part: {
        id: string
        key: string
        props: Props
        api: Api
      }) => readonly Selected<State, Key>[])
    | Reader<State[Key], { id: string; key: string; props: Props; api: Api }>
}

type Moved = (
  previous: unknown,
  next: unknown,
  notify: (name: any) => void
) => boolean | void

const isReader = (values: unknown): values is Reader<any, any> =>
  typeof values === "object" && values !== null && !Array.isArray(values)

// A store's selectors, which hear one value of one key, by `key:value`.
// Values that print the same share a selector, which only costs a spare run.
type Narrowed = {
  selectors: Map<string, Set<Listener>>
  // The keys anything selects on, so a change to a key nobody selects on,
  // like a filtered list on every keystroke, compares nothing. Readers of one
  // key keep their own `moved`, with the parts a `true` from it reaches.
  selecting: Map<PropertyKey, Map<Moved, Set<Listener>>>
}

const narrowedStores = new WeakMap<Store<any>, Narrowed>()

// The store's selectors, installed as its fanout the first time anything
// selects on it.
function narrowedOf(store: Store<any>) {
  const found = narrowedStores.get(store)
  if (found) {
    return found
  }
  const narrowed: Narrowed = {
    selectors: new Map(),
    selecting: new Map(),
  }
  narrowedStores.set(store, narrowed)
  store.setFanout((changed, previous, run) => {
    const state = store.get()
    for (const key of changed) {
      const movers = narrowed.selecting.get(key)
      if (!movers) {
        continue
      }
      const notify = (value: unknown) =>
        narrowed.selectors.get(`${String(key)}:${value}`)?.forEach(run)
      const before = (previous as Record<PropertyKey, unknown>)[key]
      for (const [moved, naming] of movers) {
        if (moved(before, state[key], notify) === true) {
          naming.forEach(run)
        }
      }
    }
  })
  return narrowed
}

/**
 * Narrows which changes reach a slot's parts. Each key maps to the values a
 * part reads it by comparing with, like `highlighted === key`: a change to
 * the key reaches the part only when the key takes or leaves one of them. A
 * key that holds an array is read by membership, like `panels.includes(key)`:
 * the part hears when one of its values joins or leaves the array. A key that
 * holds a plain object is read by entry, like `values[key]`: the part hears
 * when an entry its values name is added, removed or changed. A fixed list
 * holds values every part of the slot shares, and an empty one means the
 * part never reads the key. Changes to every other key reach every part. A
 * key read any other way must not be listed: the part would miss changes.
 * Each primitive with `selects` has a test that proves it.
 * @stable
 */
function selects<State extends object, Api, Props>(
  reads: NoInfer<Reads<State, Api, Props>>
) {
  type View = { id: string; key: string; props: Props; api: Api }
  type Values = readonly Selected<State, keyof State>[]
  type Entry = [
    keyof State,
    Values | ((part: View) => Values) | Reader<unknown, View>,
  ]
  const narrowing = (Object.entries(reads) as Entry[]).filter(
    ([, values]) =>
      isReader(values) ||
      typeof values === "function" ||
      (values as Values).length > 0
  )
  const valuesOf = (values: Entry[1], partView: View) =>
    (isReader(values)
      ? values.values(partView)
      : typeof values === "function"
        ? values(partView)
        : values) as Values
  const selected = (part: Part<State, Api, Props>, props: Props) => {
    const partView = view(part, props)
    return narrowing.map(
      ([key, values]) => [key, valuesOf(values, partView)] as const
    )
  }
  return {
    /**
     * The values a part reads each key it lists by, an empty list for a key it
     * never reads. A key it doesn't list, it reads whole.
     */
    reading(part: Part<State, Api, Props>, props: Props) {
      const partView = view(part, props)
      // A key read by name is followed whole, since only its reader knows what a change reaches.
      return new Map<PropertyKey, readonly unknown[]>(
        (Object.entries(reads) as Entry[]).flatMap(([key, values]) =>
          isReader(values) ? [] : [[key, valuesOf(values, partView)] as const]
        )
      )
    },
    /** The values a part selects on, which it subscribes again for when they change. */
    selection(part: Part<State, Api, Props>, props: Props) {
      const values = selected(part, props)
      return values.length ? JSON.stringify(values) : ""
    },
    /**
     * Runs `listener` when a change can affect the part: a key it selects on
     * took or left one of its values, or any other key changed. Every part of
     * the slot skips the listed keys as one group.
     */
    subscribe(part: Part<State, Api, Props>, listener: Listener, props: Props) {
      const cleanups = [subscribeSkipping(part.store, reads, listener)]
      for (const [key, values] of selected(part, props)) {
        const reader = reads[key]
        const moved = isReader(reader) ? (reader.moved as Moved) : eachMoved
        cleanups.push(
          ...values.map((value) =>
            select(part.store, key, value, listener, moved)
          )
        )
        if (moved !== eachMoved) {
          cleanups.push(joinMover(part.store, key, moved, listener))
        }
      }
      return () => cleanups.forEach((cleanup) => cleanup())
    },
  }
}

type Selects<State extends object, Api, Props> = ReturnType<
  typeof selects<State, Api, Props>
>

/**
 * Runs `listener` when `key` takes `value` or leaves it, for an array, when
 * `value` joins it or leaves it, and for a plain object, when its entry named
 * `value` is added, removed or changed.
 */
function select<State extends object, Key extends keyof State>(
  store: Store<State>,
  key: Key,
  value: Selected<State, Key>,
  listener: Listener,
  moved: Moved = eachMoved
) {
  // Keeps the key's mover while this selector needs it, under a listener of its own.
  const leaveMover = joinMover(store, key, moved, () => {})
  const leave = join(
    narrowedOf(store).selectors,
    `${String(key)}:${value}`,
    listener
  )
  return () => {
    leave()
    leaveMover()
  }
}

function joinMover(
  store: Store<any>,
  key: PropertyKey,
  moved: Moved,
  listener: Listener
) {
  const { selecting } = narrowedOf(store)
  let movers = selecting.get(key)
  if (!movers) {
    selecting.set(key, (movers = new Map()))
  }
  const leave = join(movers, moved, listener)
  return () => {
    leave()
    if (!movers.size && selecting.get(key) === movers) {
      selecting.delete(key)
    }
  }
}

// Runs `notify` for the value a key left and the one it took, for an array,
// for every value that may have joined or left it, and for a plain object,
// for the name of every entry added, removed or changed. A null or undefined
// array or record is an empty one. Arrays mostly change by a value or two in
// place, like a tab panel mounting, so their common start and end are
// skipped, and every value between is notified. One that only moved, or
// that's there twice, costs a spare run.
function eachMoved(
  before: unknown,
  after: unknown,
  notify: (value: unknown) => void
) {
  if (before == null) {
    before = emptyLike(after, before)
  } else if (after == null) {
    after = emptyLike(before, after)
  }
  if (isRecord(before) && isRecord(after)) {
    // Own entries only, so one named like an inherited property, like
    // `constructor`, counts as added or removed. No merged copy of both, since
    // a record can hold an entry per item of a long list.
    for (const name in before) {
      if (
        !Object.hasOwn(after, name) ||
        !Object.is(before[name], after[name])
      ) {
        notify(name)
      }
    }
    for (const name in after) {
      if (!Object.hasOwn(before, name)) {
        notify(name)
      }
    }
    return
  }
  if (!Array.isArray(before) || !Array.isArray(after)) {
    return [before, after].forEach(notify)
  }
  let start = 0
  let end = 0
  while (start < before.length && before[start] === after[start]) {
    start++
  }
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++
  }
  for (const values of [before, after]) {
    for (let index = start; index < values.length - end; index++) {
      notify(values[index])
    }
  }
}

// Objects made as literals, not arrays, dates or class instances.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && Object.getPrototypeOf(value) === Object.prototype

const noItems: readonly unknown[] = []
const noEntries: Record<string, unknown> = {}

// What a missing value stands for beside `other`: an empty array or record
// of its shape, or itself beside any other value.
const emptyLike = (other: unknown, missing: unknown) =>
  Array.isArray(other) ? noItems : isRecord(other) ? noEntries : missing

export { eachMoved, select, selects, type Reader, type Selects }
