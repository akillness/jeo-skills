// State that comes with other state: what changes with options as they
// arrive, and what's worked out from the rest of the state. Both run again in
// the same pass as the options for a framework that renders options before it
// hands them over, through `instance.follow`, so it renders them together.
import type { Store } from "./store"

// One way state derives, by what it derives from: the options `sync` made,
// with the state before them and the options themselves, or the state the
// options make.
type Derivation =
  | {
      from: "options"
      keys: string[]
      derive: (synced: object, state: object, options: object) => object | void
    }
  | { from: "state"; keys: string[]; derive: (state: object) => object | void }

// Each store's derivations, in the order they were registered.
const derivations = new WeakMap<object, Derivation[]>()

function register(store: object, derivation: Derivation) {
  let list = derivations.get(store)
  if (!list) {
    derivations.set(store, (list = []))
  }
  list.push(derivation)
}

/**
 * Derives the state that comes with options as they arrive, like the panel a
 * closing `open` leaves animating out: `derive` gets what `sync` made, the
 * state before it and the arriving options, and returns what changes with it,
 * of `keys`. It reads options from its third argument, never from
 * `context.options()`, which still holds the ones handed over last. A framework
 * that renders options before it hands them over, through `follow`, renders
 * this with them, in the same pass. Pure: it runs as the framework renders.
 * A change made any other way, like a press, still derives it where it's made.
 * Only what's registered on the instance's own store runs, not on a view of it.
 */
function deriveFromOptions<State extends object, Options = unknown>(
  context: { store: Pick<Store<State>, "get">; options?: () => Options },
  keys: (keyof State & string)[],
  derive: (
    synced: Partial<State>,
    state: State,
    options: Options
  ) => Partial<State> | void
) {
  register(context.store, {
    from: "options",
    keys,
    derive: derive as (
      synced: object,
      state: object,
      options: object
    ) => object | void,
  })
}

/**
 * Keeps state that's worked out from other state, like what each option of a
 * list shows from the query and the value, current: after every change, and,
 * for a framework that renders options before it hands them over through
 * `follow`, in the same pass as the options. `derive` reads the state it's
 * given, or `store.get()`, which returns the same while it runs, and returns
 * what changed, of `keys`. With `live: false`, a change to live keys only,
 * like a highlight moving, can't change it. Call it before the subscriptions
 * that read it.
 */
function deriveState<State extends object>(
  context: { store: Store<State> },
  keys: (keyof State & string)[],
  derive: (state: State) => Partial<State> | void,
  { live = true } = {}
) {
  const { store } = context
  register(store, {
    from: "state",
    keys,
    derive: derive as (state: object) => object | void,
  })
  store.subscribe((liveOnly) => {
    if (liveOnly && !live) {
      return
    }
    const patch = derive(store.get())
    if (patch) {
      store.set(patch)
    }
  })
}

/**
 * What `sync` made of `options`, `synced`, with what the store's derivations
 * make of it given `state`, the state before it.
 */
function withDerived<State extends object>(
  store: Store<State>,
  options: object,
  synced: Partial<State> | undefined,
  state: State
) {
  const list = derivations.get(store)
  if (!list) {
    return synced
  }
  let result = (synced ?? {}) as Record<string, unknown>
  for (const derivation of list) {
    // With nothing synced, state is as it was, so only what options derive can change.
    if (!synced && derivation.from === "state") {
      continue
    }
    const next = { ...state, ...result } as State
    const derived = (
      derivation.from === "state"
        ? store.view(next, () => derivation.derive(next))
        : derivation.derive(result, state, options)
    ) as Record<string, unknown> | undefined
    result = { ...result }
    for (const key of derivation.keys) {
      if (derived && key in derived) {
        result[key] = derived[key]
      } else if (derivation.from === "state") {
        result[key] = next[key as keyof State]
      }
    }
  }
  return (synced || Object.keys(result).length ? result : undefined) as
    Partial<State> | undefined
}

export { deriveFromOptions, deriveState, withDerived }
