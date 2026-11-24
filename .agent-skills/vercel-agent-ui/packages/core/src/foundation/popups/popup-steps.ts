// The open and close steps every popup component shares, beside `createPopupLayer`:
// a request to open or close, the change it asks for, what a refused change
// puts back, why a close happened, and the promise a controller's `open()`
// returns. A component keeps only its own rules, in three that each get
// the next step as a function, so the steps can't run out of order.
import type { createDismissal } from "./dismissal"
import type { createPopupPayload } from "./popup-payload"
import { popupResult } from "../kernel/action"
import { changeSource } from "../kernel/input-source"
import type { ChangeOptions } from "../kernel/details"
import type { Store } from "../kernel/store"
import {
  createPopupLayer,
  type Popup,
  type PopupClose,
  type PopupOpener,
  type PopupOpenOptions,
  type PopupResult,
  type ReturnMode,
} from "./popup"
import type { Anchor } from "../platform/position"

// A request to open, from a trigger, a hover, a key or a controller. Passed,
// even as `undefined`, `payload` replaces the payload. Left out, it stays.
type ShowRequest<
  Reason extends string,
  Extra extends object,
> = PopupOpenOptions<unknown, Reason> &
  Partial<Extra> & {
    // How it opens, which decides where focus goes. The `open` rule may decide instead.
    by?: PopupOpener
    // The trigger asking, by key. A controller passes none.
    trigger?: string
  }

type HideRequest<Reason extends string, Result> = ChangeOptions<Reason> & {
  // Where focus goes on this close. Defaults to the control's `returnFocus`.
  focus?: ReturnMode
  // What the promise `open()` returned resolves with, and `onOpenChange` hears.
  returnValue?: Result
}

// What `open()` resolves with when nothing opened: refused, or given an aborted signal.
function unopened<Reason extends string, Result = string>(
  reason: Reason,
  event?: Event
) {
  return popupResult(
    Promise.resolve<PopupResult<Reason, Result>>({
      reason,
      source: changeSource(reason, event),
    })
  )
}

function createOpenSteps<
  Reason extends string,
  Result = string,
  Extra extends object = {},
  // The reasons an open hands the payload, narrower than the open reasons.
  PayloadReason extends Reason = Reason,
>(config: {
  popup: Popup<Reason>
  store: Pick<Store<{ open: boolean }>, "get">
  // Fires `onOpenChange` and writes `open` unless controlled. False when refused.
  change: (
    open: boolean,
    details: { reason: Reason; event?: Event; returnValue?: Result }
  ) => boolean
  // Leaving the page settles a pending `open()` with "unmount".
  onDestroy: (cleanup: () => void) => void
  // For popups whose triggers hand their content a payload.
  payload?: ReturnType<typeof createPopupPayload<PayloadReason>>
  // `dismissible` and `onDismissAttempt`, which may refuse a dismissal before any rule hears it.
  dismissal?: ReturnType<typeof createDismissal>
  // Whether a close returns focus when its request doesn't say. Lists whose focus stays in an input pass false.
  returnFocus?: boolean
  rules?: {
    // A closed popup is asked to open. Call `open` to ask for the change, with
    // how it opens when the component decides that. It returns whether the
    // change went through, with the payload already put back when it didn't.
    // Returning without calling it refuses, like a disabled select.
    open?: (
      request: ShowRequest<Reason, Extra> & {
        reason: Reason
        payloadReason: PayloadReason
      },
      open: (by?: PopupOpener) => boolean
    ) => void
    // An open popup is asked to open again, after a controller's payload and
    // anchor applied. Call `open` to open it anew, like a panel that stays
    // open while another item takes it over.
    reopen?: (
      request: ShowRequest<Reason, Extra> & {
        reason: Reason
        payloadReason: PayloadReason
      },
      open: (by?: PopupOpener) => boolean
    ) => void
    // An open popup is asked to close. Call `close` to ask for the change. It
    // returns whether the change went through, with focus return already reset
    // when it didn't. Returning without calling it keeps the popup open.
    close?: (
      request: HideRequest<Reason, Result> & { reason: Reason },
      close: () => boolean
    ) => void
  }
}) {
  const { popup, store, rules = {} } = config
  const imperative = "imperative" as PayloadReason
  const triggerPress = "trigger-press" as PayloadReason
  let pending:
    | {
        promise: Promise<PopupResult<Reason, Result>>
        resolve: (result: PopupResult<Reason, Result>) => void
      }
    | undefined
  let requested: PopupClose<Reason, Result> | undefined
  let openAnchor: Anchor | undefined

  popup.observe((open) => {
    const closed = open
      ? undefined
      : (requested ?? { reason: imperative, source: "programmatic" })
    requested = undefined
    if (!closed) {
      return
    }
    pending?.resolve(closed)
    pending = undefined
    return closed
  })
  config.onDestroy(() => {
    pending?.resolve({ reason: "unmount", source: "programmatic" })
    pending = undefined
  })

  function result(signal?: AbortSignal) {
    if (!pending) {
      let resolve!: (result: PopupResult<Reason, Result>) => void
      const promise = popupResult(
        new Promise<PopupResult<Reason, Result>>((done) => (resolve = done))
      )
      pending = { promise, resolve }
    }
    if (signal && !signal.aborted) {
      const abort = () => popup.requestClose("imperative")
      signal.addEventListener("abort", abort, { once: true })
      pending.promise.then(() => signal.removeEventListener("abort", abort))
    }
    return pending.promise
  }

  // `setOpen` and `toggle` pass their reason as `openReason`.
  function show(
    request: ShowRequest<PayloadReason, Extra> = {},
    openReason?: Reason
  ) {
    return attempt(request, openReason).result
  }

  function attempt(
    request: ShowRequest<PayloadReason, Extra>,
    openReason?: Reason
  ) {
    const { event, signal } = request
    if (signal?.aborted) {
      return { opened: false, result: unopened<Reason, Result>(imperative) }
    }
    const payloadReason = request.reason ?? (event ? triggerPress : imperative)
    const reason: Reason = openReason ?? payloadReason
    const settled = { ...request, reason, payloadReason }
    let opened = false
    const open = (by = request.by ?? "imperative") => {
      openAnchor = request.anchor
      const restorePayload = config.payload?.opening(
        request.trigger,
        request.payload,
        {
          reason: payloadReason,
          event,
        }
      )
      popup.opening(by, event)
      opened = config.change(true, { reason, event })
      if (!opened) {
        restorePayload?.()
      }
      return opened
    }
    if (store.get().open) {
      if (popup.opener() === "hover" && request.by !== "hover") {
        popup.opening(request.by ?? "imperative", event)
      }
      if (
        request.trigger === undefined &&
        config.payload?.reopening(request, { reason: payloadReason }) &&
        request.anchor
      ) {
        openAnchor = request.anchor
      }
      rules.reopen?.(settled, open)
      return { opened, result: result(signal) }
    }
    if (rules.open) {
      rules.open(settled, open)
    } else {
      open()
    }
    return {
      opened,
      result: opened ? result(signal) : unopened<Reason, Result>(reason, event),
    }
  }

  function hide(request: HideRequest<Reason, Result> = {}) {
    if (!store.get().open) {
      return false
    }
    const { event, returnValue } = request
    const reason = request.reason ?? imperative
    if (config.dismissal && !config.dismissal.allows(reason, event)) {
      return false
    }
    let closed = false
    const close = () => {
      requested = { reason, source: changeSource(reason, event), returnValue }
      popup.returnFocus(request.focus ?? config.returnFocus ?? true)
      const changed = config.change(false, {
        reason,
        event,
        ...(returnValue !== undefined && { returnValue }),
      })
      if (!changed) {
        popup.returnFocus(true)
        requested = undefined
      }
      closed = changed
      return changed
    }
    if (rules.close) {
      rules.close({ ...request, reason }, close)
    } else {
      close()
    }
    return closed
  }

  // Another trigger takes the open popup over, with its payload. It anchors
  // at `anchor`, like a context menu moving to a point, else at that trigger.
  function takeOver({
    trigger,
    payload,
    anchor,
    reason,
    event,
  }: {
    trigger: string
    payload: unknown
    anchor?: Anchor
    reason: PayloadReason
    event?: Event
  }) {
    openAnchor = anchor
    config.payload?.handOver(trigger, payload, { reason, event })
  }

  // A controller's open that names only an open reason. It carries no
  // payload, so the payload hears "imperative", event or not. Every field of
  // `Extra` is optional, which a generic `Partial<Extra>` can't show.
  const showFor = (reason?: Reason, event?: Event) =>
    attempt(
      { reason: imperative, event } as ShowRequest<PayloadReason, Extra>,
      reason
    ).opened

  return {
    // The controller's methods. Components add `focus` and `getPayload` themselves, so lists don't expose a payload.
    api: {
      isOpen: () => store.get().open,
      setOpen: (
        open: boolean,
        { reason, event }: ChangeOptions<Reason> = {}
      ) => (open ? showFor(reason, event) : hide({ reason, event })),
      // An app's event is no trigger's, so the reason stays "imperative" unless it names one.
      open: (
        options: PopupOpenOptions<unknown, PayloadReason> & Partial<Extra> = {}
      ) => show({ ...options, reason: options.reason ?? imperative }),
      close: ({
        reason,
        event,
        returnValue,
      }: ChangeOptions<Reason> & { returnValue?: Result } = {}) =>
        hide({ reason, event, returnValue }),
      toggle: ({ reason, event }: ChangeOptions<Reason> = {}) =>
        store.get().open ? hide({ reason, event }) : showFor(reason, event),
    },
    show,
    attempt,
    hide,
    takeOver,
    // The next close, for an `open()` that opened the popup its own way.
    result,
    // A controller's or a take-over's anchor. The component falls back to its own.
    anchor: () => openAnchor,
  }
}

// A popup layer and the steps that open and close it, for a component that
// shows several popups over one value, like Navigation Menu's panels. Other
// popups get theirs from `createPopup`.
function createSteppedPopup<
  State extends { open: boolean; mounted: boolean },
  Reason extends string = string,
>(
  layer: Parameters<typeof createPopupLayer<State, Reason>>[0],
  steps: Omit<Parameters<typeof createOpenSteps<Reason>>[0], "popup" | "store">
) {
  const popup = createPopupLayer<State, Reason>(layer)
  return {
    popup,
    steps: createOpenSteps<Reason>({ ...steps, popup, store: layer.store }),
  }
}

export { createOpenSteps, createSteppedPopup, unopened }
