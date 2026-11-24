// What the parts of one kind that are in the page say about it, kept in state
// so attributes point only at elements that exist: the keys of the group
// labels that bound, or whether a title is in the page. Written a microtask
// later in every adapter: Vue binds parts in the middle of hydrating, and a
// part that hydrates after the write keeps the server's attributes, so a
// synchronous write leaves a hydrated trigger without its label. A flag only
// the part's ancestors read can be written at once (`flagWhileBound`).
import { afterBind } from "./after-bind"
import type { Store } from "./store"

type Draft = Record<string, unknown>

// Edits waiting for the microtask, per store. Parts that bind together, like
// every label of a list, write the store once, so the list's other parts
// check their attributes once, not once per label. Edits apply in the order
// parts bound and unbound.
const queued = new WeakMap<object, ((draft: Draft) => void)[]>()

function later<State extends object>(
  store: Store<State>,
  edit: (draft: Draft) => void
) {
  const waiting = queued.get(store)
  if (waiting) {
    return void waiting.push(edit)
  }
  const edits = [edit]
  queued.set(store, edits)
  afterBind(() => {
    queued.delete(store)
    const draft: Draft = {}
    for (const run of edits) {
      run(draft)
    }
    // The draft holds only the fields the edits name.
    store.set(draft as Partial<State>)
  })
}

function keyWhileBound<Field extends string>(
  store: Store<Record<NoInfer<Field>, readonly string[]>>,
  field: Field,
  key: string
) {
  const edit = (change: (keys: readonly string[]) => readonly string[]) =>
    later(store, (draft) => {
      draft[field] = change(
        (draft[field] as readonly string[] | undefined) ?? store.get()[field]
      )
    })
  let bound = true
  let added = false
  edit((keys) => {
    if (!bound) {
      return keys
    }
    added = true
    return [...keys, key]
  })
  return () => {
    bound = false
    edit((keys) => {
      if (!added) {
        return keys
      }
      // Only this bind's entry, so a part bound again before this cleanup, like under StrictMode, stays listed.
      const index = keys.indexOf(key)
      return index === -1 ? keys : keys.filter((_, at) => at !== index)
    })
  }
}

/**
 * Sets a flag while a part is in the page, like whether a list part holds the
 * options. Returns the cleanup for `bind`. With `now`, it's set as the part
 * binds, for a flag only the part's ancestors read, which have hydrated by
 * then, like whether a title names its popup: the popup moves focus before a
 * render a microtask asks for, and a screen reader announces the name it
 * finds then (`tests/specs/dialog.spec.ts`).
 */
function flagWhileBound<Key extends string>(
  store: Store<Record<NoInfer<Key>, boolean | null>>,
  key: Key,
  { now = false } = {}
) {
  const flag = (value: boolean) =>
    now
      ? store.set({ [key]: value } as Record<Key, boolean>)
      : later(store, (draft) => (draft[key] = value))
  flag(true)
  return () => flag(false)
}

/**
 * A flag that's null until the parts bind, like whether a title renders, is
 * false once they have without its part. Call it as the part that needs the
 * answer binds: parts bound with it have set the flag by the time it settles.
 */
function settleFlag<Key extends string>(
  store: Store<Record<NoInfer<Key>, boolean | null>>,
  key: Key
) {
  later(store, (draft) => {
    if (draft[key] === undefined && store.get()[key] === null) {
      draft[key] = false
    }
  })
}

export { flagWhileBound, keyWhileBound, later, settleFlag }
