// The state a primitive keeps, and who hears when it changes.
//
// - Held state is what `set` wrote, the store's own, which `heldState` reads.
// - Followed state is what a framework renders before it hands it over, as
//   Solid and Svelte do: after `follow(read)`, `get()` reads the keys `read`
//   returns ahead of held state, and the next write that isn't `delivered`
//   lands them first, as delivered, so it builds on what the page shows.
// - Viewed state is what `get()` returns inside `view(state, read)`, like a
//   render's preview. Nothing ever writes it.
// - `renders` counts the changes that can change what renders, all but those
//   to live keys alone, and `writes` the changes other than what `follow`
//   delivered, so a renderer tells whether to look again.
// - `delivered` marks a change to keys `follow` already handed over, which
//   parts that read them through their framework skip.
// - Every change reaches the component's own listeners, from `subscribe`,
//   before any part: parts hear through `subscribeSkipping`, and the ones
//   that select single values through the fanout `kernel/selects.ts`
//   installs, both after. So what a component listener changes in turn, like
//   a tab panel starting to exit, is in place before parts look, however late
//   it subscribed.

// Lists a renderer handed over again because something in them changed in
// place, like an item's label in a reactive `items` array. They hold the same
// items as before, so only their identity tells them apart.
const changedInPlace = new WeakSet<readonly unknown[]>()

/** Marks a copy of a list whose items changed in place, so it never counts as the same value. */
function markChangedInPlace<List extends readonly unknown[]>(list: List) {
  changedInPlace.add(list)
  return list
}

/**
 * Arrays with the same items count as the same value, so a controlled list
 * passed as a new array every render doesn't render again.
 */
function sameValue(a: unknown, b: unknown) {
  if (Object.is(a, b)) {
    return true
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false
  }
  if (changedInPlace.has(a) || changedInPlace.has(b)) {
    return false
  }
  return a.every((item, index) => Object.is(item, b[index]))
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Whether two slot states, or values in them, hold the same values. Arrays
 * and plain objects compare by their contents, so a slot's `state` that
 * builds `{ x }` or `[{ x }]` on every read doesn't render again. Other
 * objects, like dates, maps and elements, compare by identity.
 */
function sameSlotState(a: unknown, b: unknown) {
  return sameWithin(a, b, undefined)
}

// `open` holds the pairs being compared further up, two entries per pair. A
// pair met again is a cycle, the same as long as everything around it is.
function sameWithin(a: unknown, b: unknown, open: unknown[] | undefined) {
  if (Object.is(a, b)) {
    return true
  }
  const arrays = Array.isArray(a) && Array.isArray(b)
  if (!arrays && !(isPlainObject(a) && isPlainObject(b))) {
    return false
  }
  if (open) {
    for (let index = 0; index < open.length; index += 2) {
      if (open[index] === a && open[index + 1] === b) {
        return true
      }
    }
  }
  const within = open ?? []
  within.push(a, b)
  try {
    if (arrays) {
      const left = a as unknown[]
      const right = b as unknown[]
      if (
        left.length !== right.length ||
        changedInPlace.has(left) ||
        changedInPlace.has(right)
      ) {
        return false
      }
      for (let index = 0; index < left.length; index++) {
        if (!sameWithin(left[index], right[index], within)) {
          return false
        }
      }
      return true
    }
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    const keys = Object.keys(left)
    if (keys.length !== Object.keys(right).length) {
      return false
    }
    for (const key of keys) {
      if (!(key in right) || !sameWithin(left[key], right[key], within)) {
        return false
      }
    }
    return true
  } finally {
    within.length -= 2
  }
}

/**
 * What a store's listener hears: whether the change touched only live keys,
 * which adapters that write attributes can skip, since the core writes live
 * ones, whether it only handed over keys a framework already delivers, through
 * `follow`, which a framework's parts can skip, and the keys it changed.
 * @experimental
 */
type Listener = (
  liveOnly: boolean,
  delivered: boolean,
  changed: readonly string[]
) => void

// Parts that select single values, which hear a change last, with what
// changed and the state before it. Untyped by state, so a store with more
// keys still passes where code names fewer, like `followStop`'s `stop`.
type Fanout = (
  changed: readonly PropertyKey[],
  previous: object,
  run: (listener: Listener) => void
) => void

/**
 * A primitive's state container. `set` merges a partial and notifies only when
 * a value changed (`sameValue`). Keys in `live` change without re-rendering
 * parts that don't read them. `definePrimitive` makes one per instance.
 */
function createStore<State extends object>(
  initial: State,
  live: readonly (keyof State)[]
) {
  let state = initial
  // Changes that can change what renders: all but those to live keys alone.
  let renders = 0
  // Changes other than what `follow` delivered.
  let writes = 0
  // Keys a framework delivers before the store has them, from `follow`, and
  // what `get()` made of them last, so reads in between see one object.
  let followed: ((state: State) => Partial<State> | undefined) | undefined
  let merged: { state: State; over: Partial<State>; result: State } | undefined
  // While `followed` runs, reads see the state the store holds.
  let reading = false
  // The state reads see while `view` works something out from it.
  let viewed: State | undefined
  // The component's own listeners, which hear every change first.
  const listeners = new Set<Listener>()
  // Parts, by the keys whose changes alone they skip, then the fanout.
  const skipping = new Map<object, Set<Listener>>()
  let fanout: Fanout | undefined

  const store = {
    get() {
      return viewed ?? withFollowed()
    },
    // `delivered` marks keys `follow` already delivers, which parts that read
    // them through the framework skip.
    set(patch: Partial<State>, delivered = false) {
      // A write lands on what the framework already rendered: what `follow`
      // delivers goes in first, as if handed over now. Keys this write sets
      // stay out, since state derived from state, like a list's entries after
      // a choice, changes with the write, and parts hear it.
      if (followed && !delivered && !reading) {
        // Never a view's state, which only reads see.
        const over = withFollowed()
        if (over !== state) {
          const rest = { ...over }
          for (const key in patch) {
            delete rest[key]
          }
          store.set(rest, true)
        }
      }
      const changed: (keyof State & string)[] = []
      for (const key in patch) {
        if (!sameValue(state[key], patch[key])) {
          changed.push(key)
        }
      }
      if (!changed.length) {
        return
      }
      const previous = state
      state = { ...state, ...patch }
      const liveOnly = changed.every((key) => live.includes(key))
      notify(changed, previous, liveOnly, delivered)
    },
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    // The listeners of parts that select values, which `kernel/selects.ts` installs once.
    setFanout(next: Fanout) {
      fanout = next
    },
    // Keys `get()` reads from `read` from now on, ahead of `set`, like a
    // framework's props it hands over from an effect. `read` gets the state
    // the store holds.
    follow(read: (state: State) => Partial<State> | undefined) {
      followed = read
    },
    // Runs `read` with `get()` returning `next`, for state derived from state
    // the store doesn't hold yet, like what the framework is rendering.
    view<T>(next: State, read: () => T) {
      const before = viewed
      viewed = next
      try {
        return read()
      } finally {
        viewed = before
      }
    },
  }
  // The state with what `follow` delivers ahead of `set`, as one object
  // between reads.
  function withFollowed() {
    if (!followed || reading) {
      return state
    }
    reading = true
    let over: Partial<State> | undefined
    try {
      over = followed(state)
    } finally {
      reading = false
    }
    if (!over) {
      return state
    }
    if (merged?.state === state && merged.over === over) {
      return merged.result
    }
    let result = state
    for (const key in over) {
      if (!sameValue(state[key], over[key])) {
        result = { ...state, ...over }
        break
      }
    }
    merged = { state, over, result }
    return result
  }
  function notify(
    changed: readonly string[],
    previous: State,
    liveOnly: boolean,
    delivered: boolean
  ) {
    if (!liveOnly) {
      renders++
    }
    if (!delivered) {
      writes++
    }
    const run = (listener: Listener) => listener(liveOnly, delivered, changed)
    listeners.forEach(run)
    // A change of no keys, from `touch`, reaches every part.
    for (const [skip, group] of skipping) {
      if (!changed.length || changed.some((key) => !Object.hasOwn(skip, key))) {
        group.forEach(run)
      }
    }
    fanout?.(changed, previous, run)
  }
  held.set(store, {
    state: () => state,
    renders: () => renders,
    writes: () => writes,
    touch: () => notify([], state, false, false),
    skipping,
  })
  return store
}

const held = new WeakMap<
  object,
  {
    state: () => object
    renders: () => number
    writes: () => number
    touch: () => void
    skipping: Map<object, Set<Listener>>
  }
>()

/**
 * Runs `listener` after the component's own listeners on every change that
 * touches a key `skip` doesn't have, like a part with no `selects`, which
 * skips none, or a slot's `selects`, which skips the keys it lists.
 * Listeners that pass the same object are passed over as one.
 */
function subscribeSkipping<State extends object>(
  store: Store<State>,
  skip: { [Key in keyof State]?: unknown },
  listener: Listener
) {
  return join(held.get(store)!.skipping, skip, listener)
}

// Adds a listener to its group, and returns its removal, which drops the
// group once it's empty.
function join<Group>(
  groups: Map<Group, Set<Listener>>,
  group: Group,
  listener: Listener
) {
  let members = groups.get(group)
  if (!members) {
    groups.set(group, (members = new Set()))
  }
  members.add(listener)
  return () => {
    members.delete(listener)
    if (!members.size && groups.get(group) === members) {
      groups.delete(group)
    }
  }
}

/** The state a store holds, without what `follow` delivers ahead of `set`. */
const heldState = <State extends object>(store: Store<State>) =>
  held.get(store)!.state() as State

/**
 * How many changes a store made other than what `follow` delivered, for a
 * renderer to tell whether anything changed since it last read.
 */
const writes = (store: object) => held.get(store)!.writes()

/** How many changes a store made that can change what renders: all but those to live keys alone. */
const renders = (store: object) => held.get(store)!.renders()

/**
 * Lets `owner`, like the instance a store belongs to, stand for the store in
 * `heldState`, `writes`, `renders` and `touch`.
 */
const standFor = (owner: object, store: object) => {
  held.set(owner, held.get(store)!)
}

/**
 * Tells everyone who hears a store that something parts render besides its
 * state changed, like an id an author wrote on an element other parts point
 * at. They hear a change of no keys, which reaches every part, narrowed or not.
 */
const touch = (store: object) => held.get(store)!.touch()

/**
 * A store from `createStore`: `get()`, `set(partial)` and `subscribe(listener)`.
 * @stable
 */
type Store<State extends object> = ReturnType<typeof createStore<State>>

export {
  createStore,
  heldState,
  isPlainObject,
  join,
  type Listener,
  markChangedInPlace,
  renders,
  sameSlotState,
  sameValue,
  standFor,
  type Store,
  subscribeSkipping,
  touch,
  writes,
}
