// Finds a component from outside its tree through its controller, like a
// trigger in a table row that opens a popover elsewhere.
import { untrack } from "svelte"

// The component each controller is attached to, read by parts outside it.
// `version` changes with every registration, so a read of a controller that
// has no component yet is tracked too, and the part renders again once it
// registers. A plain map with one counter costs an app less than
// `svelte/reactivity`'s map, and only parts outside their component read it.
const controlled = new Map<object, unknown>()
let version = $state(0)

/**
 * The component a part connects to: the one its controller is attached to,
 * from anywhere on the page, or else `nearest`, the one it sits in. So a
 * trigger inside one dialog that names another's controller opens the other,
 * once that one mounts. Reading it in a template tracks it.
 */
function useControllerTarget<T>(
  controller: () => object | undefined,
  nearest: T | undefined
) {
  return () => {
    const current = controller()
    if (!current) {
      return nearest
    }
    version
    return (controlled.get(current) as T | undefined) ?? nearest
  }
}

/**
 * Registers a popup with its controller, so triggers outside it can find it.
 * It registers after mount: the server never runs it, so a trigger's first
 * client render stays the plain button the server rendered, and hydration
 * matches before the trigger binds.
 */
function useControllerEntry(
  controller: () => object | undefined,
  value: unknown
) {
  $effect(() => {
    const current = controller()
    if (!current) {
      return
    }
    controlled.set(current, value)
    // Untracked, so the effect doesn't run again for its own write.
    untrack(() => version++)
    return () => {
      if (controlled.get(current) !== value) {
        return
      }
      controlled.delete(current)
      untrack(() => version++)
    }
  })
}

export { useControllerEntry, useControllerTarget }
