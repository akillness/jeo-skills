// Finds a component from outside its tree through its controller, like a
// trigger in a table row that opens a popover elsewhere, or a scrub area in a
// toolbar that drives a number input.
import * as React from "react"

// Instances driven by a controller, so parts outside the component, like a
// trigger in a table row, can find it.
const controlled = new WeakMap<
  object,
  { value: unknown; listeners: Set<() => void> }
>()

function controlledEntry(controller: object) {
  let entry = controlled.get(controller)
  if (!entry) {
    controlled.set(
      controller,
      (entry = { value: undefined, listeners: new Set() })
    )
  }
  return entry
}

const noController = () => () => {}

// The component a part connects to: the one its controller is attached to,
// from anywhere on the page, like a trigger outside its popover, or else
// `nearest`, the one it sits in. So a trigger inside one dialog that names
// another's controller opens the other, once that one mounts.
function useControllerTarget<T>(
  controller: object | undefined,
  nearest: T | undefined
) {
  const subscribe = React.useCallback(
    (listener: () => void) => {
      if (!controller) {
        return () => {}
      }
      const { listeners } = controlledEntry(controller)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    [controller]
  )
  const read = () =>
    controller
      ? (controlled.get(controller)?.value as T | undefined)
      : undefined
  return (
    React.useSyncExternalStore(
      controller ? subscribe : noController,
      read,
      () => undefined
    ) ?? nearest
  )
}

// Registers a popup with its controller, so triggers outside it can find it.
function useControllerEntry(controller: object | undefined, value: unknown) {
  React.useLayoutEffect(() => {
    if (!controller) {
      return
    }
    const entry = controlledEntry(controller)
    entry.value = value
    entry.listeners.forEach((listener) => listener())
    return () => {
      if (entry.value !== value) {
        return
      }
      entry.value = undefined
      entry.listeners.forEach((listener) => listener())
    }
  }, [controller, value])
}

export { useControllerEntry, useControllerTarget }
