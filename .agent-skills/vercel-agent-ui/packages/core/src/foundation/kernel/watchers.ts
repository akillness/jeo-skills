// What hears every instance on the page, like `@ui-sdk/core/agent` and
// `@ui-sdk/core/observe`, and how an instance joins them while its framework
// keeps it, including one kept before anything listened.
import type { ChangeDetails, ChangeSource } from "./details"
import { whenKept } from "./keep"
import type {
  AgentSurface,
  Part,
  PrimitiveInstance,
  PropSpec,
} from "./primitive-types"

// What a watcher learns about an instance's definition.
type WatchedDefinition = {
  controlled?: string[]
  commits?: string[]
  agent?: AgentSurface
  options?: Record<string, PropSpec>
}

/**
 * Hears every instance as it's made and destroyed, with the keys its
 * definition controls and commits, and every change that goes through and
 * every commit, once something sets them, like `@ui-sdk/core/agent` and
 * `@ui-sdk/core/observe`. Empty otherwise, so a page that imports neither pays
 * one property read per change and per commit, and a weak reference per instance.
 */
const watchers: {
  add?: (
    instance: PrimitiveInstance,
    parts: ReadonlyMap<string, Part>,
    definition: WatchedDefinition
  ) => () => void
  change?: (
    id: string,
    key: string,
    value: unknown,
    details: ChangeDetails,
    previous: unknown
  ) => void
  commit?: (
    id: string,
    key: string,
    value: unknown,
    details: { reason: string; source: ChangeSource }
  ) => void
} = {}

// Instances made in a browser before anything watched, with how to start
// watching each, so an agent created later, like one a chat panel loads on
// demand, still finds the components already on the page.
const earlier = new Set<WeakRef<PrimitiveInstance>>()
const watchLater = new WeakMap<PrimitiveInstance, () => void>()

/**
 * Lets the watchers hear the instance being made while the framework keeps
 * it, and, kept before any watcher exists, once one does.
 */
function watchWhileKept(
  instance: PrimitiveInstance,
  parts: ReadonlyMap<string, Part>,
  definition: WatchedDefinition
) {
  let unwatch: (() => void) | undefined
  let waiting: WeakRef<PrimitiveInstance> | undefined
  const untrack = () => {
    unwatch?.()
    unwatch = undefined
    if (waiting) {
      earlier.delete(waiting)
    }
    waiting = undefined
  }
  whenKept(() => {
    if (watchers.add) {
      unwatch = watchers.add(instance, parts, definition)
    } else if (typeof document !== "undefined") {
      earlier.add((waiting = new WeakRef(instance)))
      // Weakly held, by the instance, so the list never keeps one alive.
      watchLater.set(
        instance,
        () => (unwatch = watchers.add?.(instance, parts, definition))
      )
      // Instances a framework made and threw away are never destroyed. Their refs go now and then.
      if (earlier.size % 1000 === 0) {
        for (const old of earlier) {
          if (!old.deref()) {
            earlier.delete(old)
          }
        }
      }
    }
    return untrack
  })
}

/** Starts watching the instances made before `watchers.add` was set. */
function watchEarlier() {
  for (const ref of earlier) {
    earlier.delete(ref)
    const instance = ref.deref()
    if (instance) {
      watchLater.get(instance)?.()
    }
  }
}

export { watchEarlier, watchers, watchWhileKept }
