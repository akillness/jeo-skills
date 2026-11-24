// Action handlers on the web are listeners, which can't return anything. An
// `action` event hands them `waitUntil()`, like `ExtendableEvent`: the part
// stays pending until every Promise passed to it settles.
import type { ActionDetails } from "@ui-sdk/core"
import { canceledAction } from "@ui-sdk/core/renderer"

/**
 * The `detail` of an `action` event: how the part was pressed, and `waitUntil()`.
 * @stable
 */
type UiActionDetail = ActionDetails & {
  /** Keeps the part pending until the Promise settles. A rejection becomes the part's error. */
  waitUntil: (promise: Promise<unknown>) => void
}

// What listeners pass to `waitUntil()` while an event dispatches. Once it has,
// nothing waits any more, so a late call throws, like `ExtendableEvent`'s.
function waitList() {
  const waiting: unknown[] = []
  let dispatching = true
  const waitUntil = (promise: unknown) => {
    if (!dispatching) {
      throw new DOMException(
        "waitUntil() can only be called while the event dispatches.",
        "InvalidStateError"
      )
    }
    waiting.push(promise)
  }
  const done = () => {
    dispatching = false
    return waiting
  }
  return { waitUntil, done }
}

// The action a part runs when pressed: it fires `action` on `el` with the
// press's details, and returns what its listeners wait for, if anything. A
// listener that cancels it cancels what the part does next, like closing its dialog.
const actionOf =
  (el: HTMLElement) => (_event: Event | undefined, details: ActionDetails) => {
    const { waitUntil, done } = waitList()
    const proceed = el.dispatchEvent(
      new CustomEvent<UiActionDetail>("action", {
        cancelable: true,
        composed: true,
        detail: { ...details, waitUntil },
      })
    )
    const waiting = done()
    if (!proceed) {
      return canceledAction
    }
    return waiting.length ? Promise.all(waiting) : undefined
  }

export { actionOf, type UiActionDetail, waitList }
