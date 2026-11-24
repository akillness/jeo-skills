// Action handlers may return a Promise, which means the part that ran them is
// pending until it settles (API guide §2, G6). Button, a dialog's Close part
// and a toast's buttons share this. Only `ActionDetails` is public, from
// `@ui-sdk/core` and under each component's own name for it.
import { note } from "#dev"
import { withSource, type ChangeSource } from "./details"

// What a pending part says by default, in English, once it has been pending
// for a second. A quick action that settles sooner says nothing, so screen
// readers hear only waits worth mentioning.
const DEFAULT_PENDING_ANNOUNCEMENT = "Loading"
const PENDING_ANNOUNCE_DELAY = 1000

/**
 * What an action receives after its event.
 * @experimental
 */
type ActionDetails = {
  /**
   * How it was pressed, like `"mouse"`, `"keyboard"` or `"agent"`. When an
   * agent pressed it, a change the action makes after an `await` comes once
   * the press is over and reports `"programmatic"`. Wrap the change in
   * `withSource(source, ...)` from the `observe` entry and it reports `"agent"`.
   */
  source: ChangeSource
}

// What a popup controller's `open()` returned. A handler like `() => dialog.open()`
// opens something; it isn't a wait, so its part doesn't go pending.
const popupResults = new WeakSet<object>()
const popupResult = <T extends object>(promise: T) => (
  popupResults.add(promise),
  promise
)

// Whether a handler returned a Promise, which marks its part pending.
const isPromise = (value: unknown): value is PromiseLike<unknown> =>
  !!value &&
  typeof (value as PromiseLike<unknown>).then === "function" &&
  !popupResults.has(value)

// What an action handler returns when it was canceled, like a web component's
// `action` event a listener prevented: nothing more happens, so the dialog a
// Close part closes stays open.
const canceledAction = Symbol("canceled action")

// Runs an action handler with the source of the press that ran it, read
// during the press. A returned Promise calls `pending(true)` and, once it
// settles, `pending(false)`. Then `done` runs on success, as part of the
// press, so what it changes after the wait, like closing a dialog, reports
// the press's source too. `failed` runs with the reason when the handler
// throws or its Promise rejects. The rejection is handled here, so it never
// surfaces as unhandled: it belongs in the part's `error` state. Development
// builds still log it, so an app that doesn't show that state doesn't lose
// the error.
function runAction(
  action: (details: ActionDetails) => unknown,
  source: ChangeSource,
  handlers: {
    pending: (pending: boolean) => void
    done: () => void
    failed: (error: unknown) => void
  }
) {
  const failed = (error: unknown) => {
    note(
      "an action failed. The error is in its part's `error` state.",
      undefined,
      error
    )
    handlers.failed(error)
  }
  const done = () => withSource(source, handlers.done)
  let result: unknown
  try {
    result = action({ source })
  } catch (error) {
    return failed(error)
  }
  if (result === canceledAction) {
    return
  }
  if (!isPromise(result)) {
    return done()
  }
  handlers.pending(true)
  result.then(
    () => {
      handlers.pending(false)
      done()
    },
    (error) => {
      handlers.pending(false)
      failed(error)
    }
  )
}

// Says the part's `pendingAnnouncement` politely, through the shared
// announcer, once `isPending` has held for a second, since screen readers
// don't read a change to `aria-busy`. Settling first, or the part leaving the
// page, cancels it. Nothing is said on settle: what the action did says that.
// The announcer loads only then, so a page whose actions all settle quickly
// never fetches it, and one that can't fetch it says nothing.
function announcePending(
  context: {
    store: { subscribe: (listener: () => void) => () => void }
    options: () => { pendingAnnouncement?: string }
    onDestroy: (cleanup: () => void) => void
  },
  isPending: () => boolean
) {
  const say = () => {
    const text =
      context.options().pendingAnnouncement ?? DEFAULT_PENDING_ANNOUNCEMENT
    import("../platform/announce").then(
      ({ announce }) => wasPending && announce(text),
      () => {}
    )
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let wasPending = false
  const unsubscribe = context.store.subscribe(() => {
    const pending = isPending()
    if (pending === wasPending) {
      return
    }
    wasPending = pending
    clearTimeout(timer)
    if (pending) {
      timer = setTimeout(say, PENDING_ANNOUNCE_DELAY)
    }
  })
  context.onDestroy(() => {
    wasPending = false
    clearTimeout(timer)
    unsubscribe()
  })
}

export {
  type ActionDetails,
  announcePending,
  canceledAction,
  isPromise,
  popupResult,
  runAction,
}
