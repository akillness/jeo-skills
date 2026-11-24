// Finds a component from outside its tree through its controller, like a
// trigger in a table row that opens a popover elsewhere, or a scrub area in a
// toolbar that drives a number input.
import { createEffect, createSignal, untrack, type Signal } from "solid-js"

// Instances driven by a controller, so parts outside the component, like a
// trigger in a table row, can find them.
const controlled = new WeakMap<object, Signal<unknown>>()

function controlledSignal(controller: object) {
  let current = controlled.get(controller)
  // Cleared from the entry's cleanup, which can run inside another
  // computation, like a `For` disposing the component.
  if (!current) {
    controlled.set(
      controller,
      (current = createSignal<unknown>(undefined, { ownedWrite: true }))
    )
  }
  return current
}

// The component a part connects to: the one its controller is attached to,
// from anywhere on the page, or else `nearest`, the one it sits in. So a
// trigger inside one dialog that names another's controller opens the other,
// once that one mounts. `nearest` is a context's value, null outside one.
// Reading it in a tracking scope tracks it, so a part renders again once the
// component mounts.
function useControllerTarget<T>(
  controller: () => object | undefined,
  nearest: T | null
) {
  return () => {
    const current = controller()
    return (
      (current && (controlledSignal(current)[0]() as T | undefined)) ??
      nearest ??
      undefined
    )
  }
}

// Registers a popup with its controller, so triggers outside it can find it.
// It registers after mount, from an effect: the server never runs it, so a
// trigger's first client render stays the plain button the server rendered,
// and hydration matches before the trigger binds.
function useControllerEntry(
  controller: () => object | undefined,
  value: unknown
) {
  createEffect(controller, (current) => {
    if (!current) {
      return
    }
    const [get, set] = controlledSignal(current)
    // A microtask later, so a trigger later in the tree hydrates as the plain
    // button the server rendered before it learns of the popup.
    let registered = false
    queueMicrotask(() => {
      if (registered) {
        return
      }
      registered = true
      set(() => value)
    })
    return () => {
      registered = true
      if (untrack(get) === value) {
        set(undefined)
      }
    }
  })
}

export { useControllerEntry, useControllerTarget }
