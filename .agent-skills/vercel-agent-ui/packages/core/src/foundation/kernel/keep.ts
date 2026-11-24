// One lifecycle per instance. Work an instance does outside itself, like
// attaching its controller, the agent hearing it or following an editor,
// starts through `whenKept(start)` while the instance is made, and stops
// through what `start` returns. `definePrimitive` gives every instance a
// record of that work as it makes it, and the framework keeps the instance
// while it holds it: `keep()` starts the work and `release()` stops it, while
// the instance keeps its state, like React's <Activity> hiding it. Most
// frameworks keep an instance from the moment they make it, so it's kept at
// once, though only in a browser: a server never destroys what it renders, so
// a module-level controller would hold a request's instance. React makes
// instances in renders it may throw away, like StrictMode's second state
// initializer, so it makes them inside `unwatched` and keeps one once it
// commits. An instance made while another is being made has a record of its
// own, which the outer one keeps and releases with its own work. `destroy()`
// discards the record, then runs the instance's `onDestroy` callbacks, once.
import { dev, warn } from "#dev"

// Starts some work and returns what stops it.
type Start = () => (() => void) | void

// An instance's work outside itself, and, while it's kept, what stops it.
type Lifecycle = { starts: Start[]; stops?: (() => void)[] }

const lifecycles = new WeakMap<object, Lifecycle>()
// The lifecycle of the instance being made, which `whenKept` adds to.
let making: Lifecycle | undefined
// Whether `unwatched` is running, so the instances it makes wait for `keep()`.
let deferring = false
// Whether an instance's `onDestroy` callbacks are running. What they cut
// short, like a drag, wasn't ended by the person, so it commits nothing.
let destroying = 0

function whileDestroying(run: () => void) {
  destroying++
  try {
    run()
  } finally {
    destroying--
  }
}

const isDestroying = () => destroying > 0

/**
 * Makes an instance with a lifecycle of its own, kept at once in a browser,
 * unless `unwatched` is making it, or another instance is being made, which
 * then keeps and releases it with its own work.
 */
function withLifecycle<T extends object>(make: () => T) {
  const outer = making
  const lifecycle: Lifecycle = { starts: [] }
  making = lifecycle
  let instance: T
  try {
    instance = make()
  } finally {
    making = outer
  }
  lifecycles.set(instance, lifecycle)
  if (outer) {
    outer.starts.push(() => {
      keep(instance)
      return () => release(instance)
    })
  } else if (!deferring && typeof document !== "undefined") {
    keep(instance)
  }
  return instance
}

/**
 * Makes an instance that starts nothing outside itself until `keep()`, for a
 * framework that may make instances during a render and throw them away,
 * like React's state initializer under StrictMode.
 */
function unwatched<T>(make: () => T) {
  const outer = deferring
  deferring = true
  try {
    return make()
  } finally {
    deferring = outer
  }
}

/**
 * Runs `start` once the framework keeps the instance being made, and again
 * at each `keep()` after a `release()`, which runs what it returns. Only an
 * instance's setup calls it: outside one, nothing would ever stop the work.
 */
function whenKept(start: Start) {
  if (making) {
    making.starts.push(start)
  } else if (dev) {
    warn(
      "`whenKept` runs only while an instance is made, so this work never starts."
    )
  }
}

/**
 * Runs `run` as part of making `instance`, after it was made, like an api
 * built once the instance wakes. What it registers with `whenKept` starts at
 * once while the instance is kept.
 */
function extendLifecycle(instance: object, run: () => void) {
  const outer = making
  const added: Lifecycle = { starts: [] }
  making = added
  try {
    run()
  } finally {
    making = outer
  }
  const lifecycle = lifecycles.get(instance)
  if (!lifecycle) {
    return
  }
  lifecycle.starts.push(...added.starts)
  for (const start of lifecycle.stops ? added.starts : []) {
    const stop = start()
    if (stop) {
      lifecycle.stops!.push(stop)
    }
  }
}

/** Starts what waits on the framework keeping an instance. Safe to call again. */
function keep(instance: object) {
  const lifecycle = lifecycles.get(instance)
  if (!lifecycle || lifecycle.stops) {
    return
  }
  const stops: (() => void)[] = (lifecycle.stops = [])
  for (const start of lifecycle.starts) {
    const stop = start()
    if (stop) {
      stops.push(stop)
    }
  }
}

/**
 * Stops what `keep()` started, while the framework holds on to the instance
 * without showing it, like React's <Activity> hiding it, or before it's
 * destroyed. The instance keeps its state, and `keep()` starts it all again.
 */
function release(instance: object) {
  const lifecycle = lifecycles.get(instance)
  const stops = lifecycle?.stops
  if (!stops) {
    return
  }
  lifecycle.stops = undefined
  stops.forEach((stop) => stop())
}

/** Stops what `keep()` started for good, as the instance is destroyed. */
function discard(instance: object) {
  release(instance)
  lifecycles.delete(instance)
}

export {
  discard,
  extendLifecycle,
  isDestroying,
  keep,
  release,
  unwatched,
  whenKept,
  whileDestroying,
  withLifecycle,
}
