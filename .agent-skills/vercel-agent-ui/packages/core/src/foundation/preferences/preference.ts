// A preference: one value from a fixed list that people choose, like an emoji
// skin tone, kept in a storage between visits and shown on a `data-*`
// attribute, so CSS styles by it. `Preferences` in each framework renders one
// inline script for a list of them, which puts every saved value on its
// attribute before hydration, so the first paint already shows it. The state
// catches up after hydration, so content that depends on it changes then.
//
// A cookie is read as the preference is created, on the server and in the
// browser alike, so hydration matches. localStorage and sessionStorage are
// read back once something subscribes, after hydration.
import {
  createDetails,
  type ChangeDetails,
  type ChangeReason,
} from "../kernel/details"
import { changeSource } from "../kernel/input-source"
import { literal, readSaved, type ValueStorage } from "../storage/storage"

/**
 * Options for `createPreference`.
 * @experimental
 */
type PreferenceOptions<Value extends string> = {
  /** Every value people can choose. A saved value that isn't one of them is ignored. */
  values: readonly Value[]
  /** The value before anything is saved, and after a saved value is removed. */
  defaultValue: NoInfer<Value>
  /** The attribute that shows the value, which has to start with `data-`, like `"data-skin-tone"`. */
  attribute: `data-${string}`
  /**
   * Whether the attribute goes on `<html>`, for a preference the whole page
   * styles by. Otherwise it goes on the `Preferences` element, for the part
   * of the page inside it.
   * @defaultValue false
   */
  global?: boolean
  /** Where the value is kept between visits, from `createLocalStorage`, `createSessionStorage` or `createCookieStorage`. */
  storage?: ValueStorage
  /** Called before the value changes, with its reason. `details.cancel()` keeps the current one. */
  onValueChange?: (value: Value, details: ChangeDetails<ChangeReason>) => void
}

/**
 * What `Preferences` and `preferencesScript` take: a preference from
 * `createPreference`, or a color scheme from `createColorScheme`.
 * @experimental
 */
type PreferenceLike = {
  /** The attribute that shows the value. */
  attribute: `data-${string}`
  /** Whether the attribute goes on `<html>`. */
  global: boolean
  /** Every value it allows. */
  values: readonly string[]
  /** The value when nothing allowed is saved. */
  defaultValue: string
  /** Where the value is kept. */
  storage?: ValueStorage | undefined
  /** What the server and the first client render show. */
  initialState: { value: string }
  /** The current state. */
  get: () => { value: string }
  /** Hears every change. Returns the function that stops it. */
  subscribe: (listener: () => void) => () => void
}

/**
 * A primitive's store, or any state with `get` and `set`, that `follow` keeps in step.
 * @experimental
 */
type PreferenceStore<Key extends string, State> = {
  /** The current state. */
  get: () => { [K in Key]: State }
  /** Writes part of the state. */
  set: (partial: { [K in Key]: State }) => void
}

const checkAttribute = (attribute: string) => {
  if (!/^data-[a-z0-9-]+$/.test(attribute)) {
    throw new Error(
      `A preference only shows itself on data-* attributes, not "${attribute}".`
    )
  }
}

/**
 * Keeps `key` in a store set to `source`'s state, from a part's `bind`: the
 * state starts where the server's did, catches up a microtask later, once
 * hydration is done, and follows every change after that.
 */
function followIn<State, Key extends string>(
  source: { get: () => State; subscribe: (listener: () => void) => () => void },
  store: PreferenceStore<Key, State>,
  key: Key
) {
  const write = () => {
    const next = source.get()
    // A cast, since TypeScript can't tell that a computed key makes the mapped type.
    if (store.get()[key] !== next) {
      store.set({ [key]: next } as { [K in Key]: State })
    }
  }
  let stopped = false
  let unsubscribe: (() => void) | undefined
  // A microtask later, like the platform's shortcut names, so every part a
  // framework hydrates in this pass renders what the server did first.
  queueMicrotask(() => {
    if (stopped) {
      return
    }
    unsubscribe = source.subscribe(write)
    write()
  })
  return () => {
    stopped = true
    unsubscribe?.()
  }
}

/**
 * A value people choose from a list, kept between visits in `storage` and
 * shown on `attribute`, so CSS styles by it. Pass it to `Preferences`, which
 * puts the saved value there before hydration.
 * @experimental
 */
function createPreference<const Value extends string>(
  options: PreferenceOptions<Value>
) {
  checkAttribute(options.attribute)
  const { storage, values } = options
  const isValue = (value: string | null | undefined): value is Value =>
    value != null && (values as readonly string[]).includes(value)
  if (!isValue(options.defaultValue)) {
    throw new Error(
      `"${options.defaultValue}" isn't one of the preference's values.`
    )
  }
  // What the storage held when this last read or wrote it, so subscribing
  // again catches up with whatever changed in between, removals too.
  // Undefined until the first read.
  let synced = storage?.readsOnServer ? storage.get() : undefined
  // A storage the server reads too starts the value on both sides, so hydration matches.
  const startValue: Value = isValue(synced) ? synced : options.defaultValue
  let value = startValue
  const initialState: { value: Value } = { value: startValue }
  // The same object until something changes, so frameworks can compare snapshots.
  let state = initialState
  const listeners = new Set<(state: { value: Value }) => void>()

  // What a read shows before anything subscribes: the saved value, read once,
  // so a render in the browser only, which reads `get`, starts with it.
  // Hydration starts from `initialState` instead, and the value catches up
  // once something subscribes.
  let peeked: string | null | undefined
  let changed = false
  const shown = () => {
    if (synced !== undefined || changed || !storage || storage.readsOnServer) {
      return value
    }
    peeked ??= storage.get()
    return isValue(peeked) ? peeked : value
  }

  const get = () => {
    const current = shown()
    if (state.value !== current) {
      state = { value: current }
    }
    return state
  }

  const set = (
    next: Value,
    change: { reason?: ChangeReason; event?: Event } = {}
  ) => {
    // Compared with what a read shows, which before anything subscribes can be the saved value.
    if (next === shown() || !isValue(next)) {
      return false
    }
    const reason = change.reason ?? "imperative"
    const details = createDetails(
      { reason, event: change.event },
      changeSource(reason, change.event)
    )
    options.onValueChange?.(next, details)
    if (details.canceled) {
      return false
    }
    value = next
    changed = true
    // A value read from storage is already there.
    if (
      reason !== "restore" &&
      reason !== "storage-sync" &&
      storage?.set(next)
    ) {
      synced = next
    }
    const current = get()
    for (const listener of [...listeners]) {
      listener(current)
    }
    return true
  }

  let unwatch: (() => void) | undefined

  const subscribe = (listener: (state: { value: Value }) => void) => {
    // A wrapper per subscription, so the same listener subscribed twice stops once per call.
    const entry = (state: { value: Value }) => listener(state)
    listeners.add(entry)
    if (listeners.size === 1 && storage) {
      // Read back what was saved, now that hydration is done, then hear other tabs.
      const current = storage.get()
      if (current !== synced) {
        const first = synced === undefined
        synced = current
        // Nothing saved the first time keeps the starting value. A value
        // removed since the last read goes back to the default.
        if (isValue(current)) {
          set(current, { reason: "restore" })
        } else if (!first) {
          set(options.defaultValue, { reason: "restore" })
        }
      }
      unwatch = storage.subscribe((next) => {
        synced = next
        set(isValue(next) ? next : options.defaultValue, {
          reason: "storage-sync",
        })
      })
    }
    return () => {
      if (!listeners.delete(entry) || listeners.size > 0) {
        return
      }
      unwatch?.()
      unwatch = undefined
    }
  }

  return {
    /** The attribute that shows the value. */
    attribute: options.attribute,
    /** Whether the attribute goes on `<html>`. */
    global: options.global ?? false,
    /** Every value people can choose. */
    values,
    /** The value when nothing allowed is saved. */
    defaultValue: options.defaultValue,
    /** Where the value is kept between visits. */
    storage,
    /** What the server and the first client render show: `defaultValue`, or the value a cookie keeps. */
    initialState,
    /**
     * The current state, the same object until the value changes. In the
     * browser it's the saved value even before anything subscribes, for a
     * render in the browser only. Hydrate from `initialState`.
     */
    get,
    /**
     * Changes the value, through `onValueChange`, which can cancel it, and
     * saves it. The reason defaults to `"imperative"`. Returns whether it changed.
     */
    set,
    /** Hears every change. The first subscriber reads back the saved value. Returns the function that stops it. */
    subscribe,
    /**
     * Keeps `key` in a store set to the preference's state. Call it from a
     * part's `bind`: the state starts at `initialState`, catches up a
     * microtask later, once hydration is done, and follows every change after
     * that. Returns the cleanup for `bind`.
     */
    follow: <Key extends string>(
      store: PreferenceStore<Key, { value: Value }>,
      key: Key
    ) => followIn({ get, subscribe }, store, key),
  }
}

/**
 * A preference, from `createPreference`.
 * @experimental
 */
type Preference<Value extends string = string> = ReturnType<
  typeof createPreference<Value>
>

/**
 * The inline script that `Preferences` renders as its first child. As the
 * page loads, before any bundle, it puts each preference's saved value, or
 * its default, on its attribute: on `<html>` for a global one, and on the
 * element around the script for the rest. Every preference with the same
 * storage reads it once. A value that isn't one of a preference's values is
 * never written.
 * @experimental
 */
function preferencesScript(preferences: readonly PreferenceLike[]) {
  const list = preferences.map((preference) => {
    checkAttribute(preference.attribute)
    const { storage } = preference
    return [
      storage?.kind ?? null,
      storage?.id ?? null,
      preference.attribute,
      preference.global,
      preference.values,
      preference.defaultValue,
    ]
  })
  return `(function(r,p){var t=document.currentScript,e=t&&t.parentElement;for(var j=0;j<p.length;j++){try{var x=p[j],s=x[0]?r(x[0],x[1]):null;if(x[4].indexOf(s)<0)s=x[5];var o=x[3]?document.documentElement:e;if(o)o.setAttribute(x[2],s)}catch(n){}}})(${readSaved},${literal(list)})`
}

export {
  createPreference,
  followIn,
  type Preference,
  type PreferenceLike,
  type PreferenceOptions,
  type PreferenceStore,
  preferencesScript,
}
