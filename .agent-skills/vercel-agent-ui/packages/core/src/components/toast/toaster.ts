// The toast queue. Framework-free: `toast("Saved")` works from anywhere, and a
// region, rendered by the overlay host or placed by the app, shows it. The
// queue holds data and decides nothing about time or focus; the region runs
// timers only for toasts it shows, so a toast never expires unseen.
import type { ActionDetails } from "../../foundation/kernel/action"
import {
  createDetails,
  type ChangeDetails,
} from "../../foundation/kernel/details"
import { changeSource } from "../../foundation/kernel/input-source"
import {
  overlays as sharedOverlays,
  type Overlays,
} from "../../page/overlays/overlays"

/**
 * What a toast is about. `"error"` is announced assertively, and `"loading"` stays until updated.
 * @stable
 */
type ToastType =
  "default" | "success" | "error" | "info" | "warning" | "loading"

/**
 * Why a toast closed.
 * @stable
 */
type ToastDismissReason =
  "timeout" | "close-press" | "swipe" | "escape-key" | "action" | "imperative"

/**
 * What `onDismiss` receives. `cancel()` keeps the toast, like a swipe that snaps back.
 * @stable
 */
type ToastDismissDetails = ChangeDetails<ToastDismissReason>

/**
 * What a toast's action and close buttons receive after the event: how the button was pressed.
 * @experimental
 */
type ToastActionDetails = ActionDetails

/**
 * A button in the toast that does something, like Undo.
 * @stable
 */
type ToastAction<Content = unknown> = {
  /** The button's text. */
  label: Content
  /**
   * Runs when it's pressed. A returned Promise marks the action pending, then
   * dismisses the toast once it resolves. A rejection keeps the toast.
   * `details.source` says how it was pressed, for changes made after an `await`.
   */
  onAction?: (event: Event | undefined, details: ToastActionDetails) => unknown
  /** Makes the action a link. */
  href?: string
  /**
   * Whether pressing it dismisses the toast.
   * @defaultValue true
   */
  dismiss?: boolean
}

/**
 * A button that dismisses the toast, like Cancel.
 * @stable
 */
type ToastCancel<Content = unknown> = {
  /** The button's text. */
  label: Content
  /** Runs when it's pressed, before the toast closes. `details.source` says how it was pressed. */
  onCancel?: (event: Event | undefined, details: ToastActionDetails) => void
}

/**
 * Everything a toast can say and do. Every field is optional.
 * @stable
 */
type ToastOptions<Content = unknown> = {
  /** Reuses a toast: a toast with this id that's still showing is updated instead of added again. */
  id?: string
  /** The main message. */
  title?: Content
  /** More detail, under the title. */
  description?: Content
  /**
   * What it's about, for styling through `data-type`, and for how it's announced.
   * @defaultValue "default"
   */
  type?: ToastType
  /**
   * How long it shows, in ms, while nothing pauses it. `Infinity` keeps it until dismissed.
   * @defaultValue the toaster's duration, 5000, and `Infinity` for `"loading"`
   */
  duration?: number
  /**
   * How screen readers announce it: `"polite"` waits for a pause, `"assertive"` interrupts.
   * @defaultValue "assertive" for errors, "polite" otherwise
   */
  priority?: "polite" | "assertive"
  /** A button that does something, like Undo. */
  action?: ToastAction<Content>
  /** A button that dismisses it, like Cancel. */
  cancel?: ToastCancel<Content>
  /**
   * Whether the user can dismiss it: swiping, Escape and Close parts. Timers and `dismiss()` still close it.
   * @defaultValue true
   */
  dismissible?: boolean
  /** Anything else, for your own rendering, like an avatar. */
  data?: unknown
  /** Runs when it closes, with why. Calling `details.cancel()` keeps it. */
  onDismiss?: (details: ToastDismissDetails) => void
}

/**
 * A toast in the queue, as regions render it.
 * @stable
 */
type Toast<Content = unknown> = Omit<
  ToastOptions<Content>,
  "id" | "type" | "duration" | "priority"
> & {
  /** Unique within its toaster. */
  id: string
  /** What it's about. */
  type: ToastType
  /** How long it shows, in ms. */
  duration: number
  /** How screen readers announce it. */
  priority: "polite" | "assertive"
  /** Increases with every update, so a region announces it again and restarts its timer. */
  version: number
  /** When it was added, relative to the others. Newer toasts have a higher order. */
  order: number
}

/** A message, or the options for a toast, or a function of the settled value that returns either. */
type PromiseMessage<Content, Value> =
  | Content
  | ToastOptions<Content>
  | ((value: Value) => Content | ToastOptions<Content>)

let ids = 0
let orders = 0

// A plain object of options, rather than content like a string or an element.
// Framework elements are plain objects too, so they're told apart by their markers.
function isOptions(value: unknown): value is ToastOptions<unknown> {
  if (!value || typeof value !== "object") {
    return false
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false
  }
  return !("$$typeof" in value) && !("__v_isVNode" in value)
}

// What a region needs from its toaster that isn't public api. Shared on
// `globalThis` like `toast`, so a second copy of core, such as one hot reload
// loads, finds the shared toaster's side too.
const internals = () =>
  ((globalThis as Record<symbol, unknown>)[
    Symbol.for("ui-sdk.toaster-internals@1")
  ] ??= new WeakMap<object, ToasterInternals>()) as WeakMap<
    object,
    ToasterInternals
  >

type ToasterInternals = {
  // Closes a toast for a reason, unless `onDismiss` cancels. Returns whether it closed.
  close: (id: string, reason: ToastDismissReason, event?: Event) => boolean
  // Counts a region the app placed, so the overlay host doesn't render a second one.
  attachRegion: (placed: boolean) => () => void
  // Whether a region the app placed shows this toaster.
  hasPlacedRegion: () => boolean
}

// The internal side of a toaster, for regions and hosts.
function toasterInternals(toaster: object) {
  const found = internals().get(toaster)
  if (!found) {
    throw new Error("Expected a toaster from createToaster().")
  }
  return found
}

/**
 * Creates a queue of toasts and the function that adds to it. Most apps use
 * the shared `toast`. Create another for a second region with its own place
 * and toasts, and pass it to that region as `toaster`.
 * @stable
 */
function createToaster<Content = string>({
  duration: defaultDuration = 5000,
  overlays = sharedOverlays,
}: {
  /**
   * How long toasts show, in ms, unless a toast says otherwise.
   * @defaultValue 5000
   */
  duration?: number
  /**
   * The registry whose host renders this toaster's region when the app hasn't placed one.
   * @defaultValue the shared `overlays`
   */
  overlays?: Overlays
} = {}) {
  // Newest first. Replaced on every change, so frameworks can compare by identity.
  let toasts: readonly Toast<Content>[] = []
  const listeners = new Set<() => void>()
  let placedRegions = 0
  let mounted = false

  const notify = () => listeners.forEach((listener) => listener())

  function resolve(
    input: Content | ToastOptions<Content>,
    extra?: ToastOptions<Content>
  ) {
    const options = isOptions(input) ? input : { title: input }
    return { ...options, ...extra } as ToastOptions<Content>
  }

  // Fills in what a toast leaves out, from its type.
  function complete(options: ToastOptions<Content>, previous?: Toast<Content>) {
    const type = options.type ?? previous?.type ?? "default"
    // A loading toast that becomes a result starts a fresh duration of its own.
    const typeChanged = !!previous && type !== previous.type
    return {
      ...previous,
      ...options,
      id: options.id ?? previous?.id ?? `toast-${++ids}`,
      type,
      duration:
        options.duration ??
        (typeChanged ? undefined : previous?.duration) ??
        (type === "loading" ? Infinity : defaultDuration),
      priority:
        options.priority ??
        (typeChanged ? undefined : previous?.priority) ??
        (type === "error" ? "assertive" : "polite"),
      version: (previous?.version ?? 0) + 1,
      order: previous?.order ?? ++orders,
    }
  }

  function add(options: ToastOptions<Content>) {
    const existing = options.id
      ? toasts.find((toast) => toast.id === options.id)
      : undefined
    if (existing) {
      update(existing.id, options)
      return existing.id
    }
    const toast = complete(options)
    toasts = [toast, ...toasts]
    // The host renders this toaster's region from its first toast on, unless the app placed one.
    if (!mounted && !placedRegions) {
      mounted = true
      overlays.mount("toaster", { toaster }, () => placedRegions > 0)
    }
    notify()
    return toast.id
  }

  /**
   * Changes a toast that's still showing, and restarts its timer. Returns
   * false when it already closed, so a late update never brings it back.
   */
  function update(id: string, options: Content | ToastOptions<Content>) {
    const index = toasts.findIndex((toast) => toast.id === id)
    if (index === -1) {
      return false
    }
    const next = [...toasts]
    next[index] = complete({ ...resolve(options), id }, toasts[index])
    toasts = next
    notify()
    return true
  }

  function close(id: string, reason: ToastDismissReason, event?: Event) {
    const toast = toasts.find((item) => item.id === id)
    if (!toast) {
      return false
    }
    const details = createDetails(
      { reason, event },
      changeSource(reason, event)
    )
    toast.onDismiss?.(details)
    if (details.canceled) {
      return false
    }
    toasts = toasts.filter((item) => item !== toast)
    notify()
    return true
  }

  /**
   * Shows a toast and returns its id: `toast("Saved")`,
   * `toast("Deleted", { action: { label: "Undo", onAction: restore } })` or
   * `toast({ title, description })`.
   */
  function toaster(
    message: Content | ToastOptions<Content>,
    options?: ToastOptions<Content>
  ) {
    return add(resolve(message, options))
  }

  const typed =
    (type: ToastType) =>
    (
      message: Content | ToastOptions<Content>,
      options?: ToastOptions<Content>
    ) =>
      add({ ...resolve(message, options), type })

  const api = {
    /** Shows a success toast. Returns its id. */
    success: typed("success"),
    /** Shows an error toast, announced assertively. Returns its id. */
    error: typed("error"),
    /** Shows an informational toast. Returns its id. */
    info: typed("info"),
    /** Shows a warning toast. Returns its id. */
    warning: typed("warning"),
    /** Shows a loading toast, which stays until you update or dismiss it. Returns its id. */
    loading: typed("loading"),
    /**
     * Shows a loading toast for a Promise, then turns it into a success or an
     * error toast when it settles. A toast dismissed while loading stays closed.
     * Returns its id.
     */
    promise<Value>(
      promise: Promise<Value> | (() => Promise<Value>),
      messages: {
        /** While it's pending. */
        loading: Content | ToastOptions<Content>
        /** Once it resolves. Without it, the toast closes. */
        success?: PromiseMessage<Content, Value>
        /** Once it rejects. Without it, the toast closes. */
        error?: PromiseMessage<Content, unknown>
      },
      options?: ToastOptions<Content>
    ) {
      const id = add({ ...resolve(messages.loading, options), type: "loading" })
      const settle = (
        type: ToastType,
        message: PromiseMessage<Content, any> | undefined,
        value: unknown
      ) => {
        if (message === undefined) {
          return close(id, "imperative")
        }
        const result =
          typeof message === "function"
            ? (message as (value: unknown) => Content)(value)
            : message
        update(id, { ...resolve(result), type })
      }
      const running = typeof promise === "function" ? promise() : promise
      running.then(
        (value) => settle("success", messages.success, value),
        (error) => settle("error", messages.error, error)
      )
      return id
    },
    update,
    /** Closes one toast by id, or every toast without one. */
    dismiss(id?: string) {
      for (const toast of id === undefined
        ? toasts
        : toasts.filter((item) => item.id === id)) {
        close(toast.id, "imperative")
      }
    },
    /** The toasts in the queue, newest first. The same array until something changes. */
    toasts: () => toasts,
    /** Calls `listener` whenever a toast is added, updated or closed. Returns a function that stops it. */
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  Object.assign(toaster, api)
  internals().set(toaster, {
    close,
    attachRegion(placed) {
      if (!placed) {
        return () => {}
      }
      placedRegions++
      notify()
      let attached = true
      return () => {
        if (!attached) {
          return
        }
        attached = false
        placedRegions--
        notify()
      }
    },
    hasPlacedRegion: () => placedRegions > 0,
  })
  return toaster as typeof toaster & typeof api
}

/**
 * A queue of toasts, from `createToaster()`. Call it to show one.
 * @stable
 */
type Toaster<Content = string> = ReturnType<typeof createToaster<Content>>

/**
 * Shows a toast from anywhere: `toast("Saved")`, `toast.success(...)`,
 * `toast.promise(save(), { loading, success, error })`. The overlay host, or a
 * region you place, shows it.
 * @stable
 */
const toast = ((globalThis as Record<symbol, unknown>)[
  Symbol.for("ui-sdk.toast@1")
] ??= createToaster<unknown>()) as Toaster

export {
  createToaster,
  toast,
  type Toast,
  type ToastAction,
  type ToastActionDetails,
  type ToastCancel,
  type ToastDismissDetails,
  type ToastDismissReason,
  type Toaster,
  toasterInternals,
  type ToastOptions,
  type ToastType,
}
