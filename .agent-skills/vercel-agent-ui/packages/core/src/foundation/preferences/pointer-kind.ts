// The device's pointer from the pointer and hover media features. The server
// can't know it, so it's "unknown" there unless `initial` says. Every pointer
// kind on a window shares its queries and their listeners.
import { isBrowser } from "../platform/env"
import { followIn } from "./preference"

/**
 * How precise a pointer is: `"fine"` for a mouse, trackpad or stylus,
 * `"coarse"` for a finger, `"none"` without one, or `"unknown"` before it's known.
 * @experimental
 */
type PointerPrecision = "fine" | "coarse" | "none" | "unknown"

/**
 * Whether a pointer can hover: `"hover"`, `"none"`, or `"unknown"` before it's known.
 * @experimental
 */
type PointerHover = "hover" | "none" | "unknown"

/**
 * Everything a pointer kind knows, named after the media features it reads.
 * @experimental
 */
type PointerKindState = {
  /** The main pointer's precision: `"coarse"` on a phone. */
  pointer: PointerPrecision
  /** Whether the main pointer can hover. */
  hover: PointerHover
  /** The most precise of all the pointers, like `"fine"` for a tablet with a trackpad. */
  anyPointer: PointerPrecision
  /** Whether any of the pointers can hover. */
  anyHover: PointerHover
}

/**
 * Options for `createPointerKind`.
 * @experimental
 */
type PointerKindOptions = {
  /**
   * What the server and the first client render assume, so hydration
   * matches, like `pointerKindOf`'s guess from the request. Fields left out are `"unknown"`.
   */
  initial?: Partial<PointerKindState>
  /** The window to read, like an iframe's. Defaults to the page's window. */
  view?: Window
}

/**
 * A primitive's store, or any state with `get` and `set`, that `follow` keeps in step.
 * @experimental
 */
type PointerKindStore<Key extends string> = {
  /** The current state. */
  get: () => { [K in Key]: PointerKindState }
  /** Writes part of the state. */
  set: (partial: { [K in Key]: PointerKindState }) => void
}

const features = {
  pointerFine: "(pointer: fine)",
  pointerCoarse: "(pointer: coarse)",
  pointerNone: "(pointer: none)",
  hover: "(hover: hover)",
  hoverNone: "(hover: none)",
  anyFine: "(any-pointer: fine)",
  anyCoarse: "(any-pointer: coarse)",
  anyNone: "(any-pointer: none)",
  anyHover: "(any-hover: hover)",
  anyHoverNone: "(any-hover: none)",
} as const

type Shared = {
  queries: Record<keyof typeof features, MediaQueryList>
  listeners: Set<() => void>
  notify: () => void
}

const sharedByView = new WeakMap<Window, Shared>()

// The window's queries and listeners, made the first time a pointer kind reads them.
function sharedOf(view: Window | undefined) {
  if (!view || typeof view.matchMedia !== "function") {
    return
  }
  let shared = sharedByView.get(view)
  if (shared) {
    return shared
  }
  const queries = Object.fromEntries(
    Object.entries(features).map(([name, query]) => [
      name,
      view.matchMedia(query),
    ])
  ) as Shared["queries"]
  const listeners = new Set<() => void>()
  shared = {
    queries,
    listeners,
    notify: () => {
      for (const listener of [...listeners]) {
        listener()
      }
    },
  }
  sharedByView.set(view, shared)
  return shared
}

// A browser that doesn't know a feature matches none of its values, which reads as "unknown".
const precision = (
  fine: MediaQueryList,
  coarse: MediaQueryList,
  none: MediaQueryList
) =>
  fine.matches
    ? "fine"
    : coarse.matches
      ? "coarse"
      : none.matches
        ? "none"
        : "unknown"
const hovering = (hover: MediaQueryList, none: MediaQueryList) =>
  hover.matches ? "hover" : none.matches ? "none" : "unknown"

const read = ({ queries: q }: Shared) => {
  const state: PointerKindState = {
    pointer: precision(q.pointerFine, q.pointerCoarse, q.pointerNone),
    hover: hovering(q.hover, q.hoverNone),
    anyPointer: precision(q.anyFine, q.anyCoarse, q.anyNone),
    anyHover: hovering(q.anyHover, q.anyHoverNone),
  }
  return state
}

const same = (a: PointerKindState, b: PointerKindState) =>
  a.pointer === b.pointer &&
  a.hover === b.hover &&
  a.anyPointer === b.anyPointer &&
  a.anyHover === b.anyHover

/**
 * The device's pointer: whether it's a finger or a mouse, and whether it can
 * hover, for behavior like opening on tap where nothing hovers. Style with
 * the media queries instead. Read it like a preference, with `get`,
 * `subscribe`, `follow`, or `usePreference` in a framework.
 * @experimental
 */
function createPointerKind(options: PointerKindOptions = {}) {
  const initialState: PointerKindState = {
    pointer: "unknown",
    hover: "unknown",
    anyPointer: "unknown",
    anyHover: "unknown",
    ...options.initial,
  }
  const shared = () =>
    sharedOf(options.view ?? (isBrowser ? window : undefined))
  // The same object until something changes, so frameworks can compare snapshots.
  let state = initialState

  const get = () => {
    const current = shared()
    if (!current) {
      return state
    }
    const next = read(current)
    if (!same(state, next)) {
      state = next
    }
    return state
  }

  const listeners = new Set<(state: PointerKindState) => void>()
  const notify = () => {
    const next = get()
    for (const listener of [...listeners]) {
      listener(next)
    }
  }

  const subscribe = (listener: (state: PointerKindState) => void) => {
    // A wrapper per subscription, so the same listener subscribed twice stops once per call.
    const entry = (state: PointerKindState) => listener(state)
    listeners.add(entry)
    const current = shared()
    if (listeners.size === 1 && current) {
      if (current.listeners.size === 0) {
        for (const query of Object.values(current.queries)) {
          query.addEventListener("change", current.notify)
        }
      }
      current.listeners.add(notify)
    }
    return () => {
      if (!listeners.delete(entry) || listeners.size > 0) {
        return
      }
      if (!current?.listeners.delete(notify) || current.listeners.size > 0) {
        return
      }
      for (const query of Object.values(current.queries)) {
        query.removeEventListener("change", current.notify)
      }
    }
  }

  return {
    /** What the server and the first client render show: `initial`, and `"unknown"` for the rest. */
    initialState,
    /** What the pointer kind knows now. The same object until something changes. */
    get,
    /** Hears every change, like a mouse plugged into a tablet. Returns the function that stops it. */
    subscribe,
    /**
     * Keeps `key` in a store set to the pointer kind's state. Call it from a
     * part's `bind`: the state starts at `initialState`, catches up a
     * microtask later, once hydration is done, and follows every change after
     * that. Returns the cleanup for `bind`.
     */
    follow: <Key extends string>(store: PointerKindStore<Key>, key: Key) =>
      followIn({ get, subscribe }, store, key),
  }
}

/**
 * A pointer kind, from `createPointerKind`.
 * @experimental
 */
type PointerKind = ReturnType<typeof createPointerKind>

/**
 * A guess at the pointer from a request's `Sec-CH-UA-Mobile` header, for
 * `createPointerKind`'s `initial`: a finger without hover on a phone, a mouse
 * otherwise. Only Chromium browsers send it, so it's empty without one.
 * @experimental
 */
function pointerKindOf(mobileHint: string | null | undefined) {
  const hint = mobileHint?.trim()
  const guess: Partial<PointerKindState> =
    hint === "?1"
      ? { pointer: "coarse", hover: "none" }
      : hint === "?0"
        ? { pointer: "fine", hover: "hover" }
        : {}
  return guess
}

export {
  type PointerHover,
  type PointerKind,
  type PointerKindOptions,
  type PointerKindState,
  type PointerKindStore,
  type PointerPrecision,
  createPointerKind,
  pointerKindOf,
}
