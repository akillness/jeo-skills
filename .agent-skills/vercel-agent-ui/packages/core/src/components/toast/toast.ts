// A region that shows a toaster's toasts, and its public types. The queue
// lives in `toaster.ts`. What's on screen, for how long, how it's announced
// and where focus goes is in `toast-api.ts`, the parts in `toast-parts.ts`,
// the countdowns in `toast-timers.ts` and the DOM helpers in `toast-dom.ts`.
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { toastSlots } from "./toast-parts"
import {
  hasToasts,
  initialToastState,
  syncToastState,
  toastRegionApi,
} from "./toast-api"
import type { Toast, ToastActionDetails, Toaster } from "./toaster"

/**
 * Options for a toast region.
 * @stable
 */
type ToastRegionOptions = {
  /**
   * The queue it shows. A second toaster, from `createToaster()`, gives a second region its own toasts.
   * @defaultValue the shared `toast`
   */
  toaster?: Toaster<any>
  /**
   * The edge of the viewport it sits on. Swiping toward it dismisses a toast.
   * @defaultValue "bottom"
   */
  side?: "top" | "bottom"
  /**
   * Where along that edge. `"start"` and `"end"` follow the writing direction, and swiping toward them dismisses too.
   * @defaultValue "end"
   */
  align?: "start" | "center" | "end"
  /**
   * How many toasts show at once. Older ones wait, with their timers stopped, until there's room.
   * @defaultValue 3
   */
  maxVisible?: number
  /**
   * Whether the stack is always expanded. Otherwise it expands while the pointer or focus is in it.
   * @defaultValue false
   */
  expanded?: boolean
  /**
   * The key that moves focus into the region and back, like `"F6"` or `"alt+t"`. `null` turns it off.
   * @defaultValue "F6"
   */
  shortcut?: string | null
  /**
   * What screen readers hear once a toast's action or close button has been pending for a second,
   * so a slow action doesn't pass in silence. Set it in the page's language. An empty string says nothing.
   * @defaultValue "Loading"
   */
  pendingAnnouncement?: string
} & PrimitiveOptions

/**
 * A toast as a region renders it.
 * @stable
 */
type ToastItem<Content = unknown> = {
  /** The toast's data. */
  toast: Toast<Content>
  /** Its place in the stack, 0 for the newest. A closing toast keeps the place it had. */
  index: number
  /** Whether it's animating out, closed or pushed past `maxVisible`. */
  leaving: boolean
}

/**
 * The region's state, for render functions.
 * @stable
 */
type ToastRegionState = {
  /** The edge it sits on. */
  side: "top" | "bottom"
  /** Where along that edge. */
  align: "start" | "center" | "end"
  /** Whether the stack is expanded. */
  expanded: boolean
  /** The toasts to render, newest first, including ones animating out. */
  toasts: readonly ToastItem[]
}

/**
 * A toast's state, for render functions.
 * @stable
 */
type ToastState = {
  /** What it's about. */
  type: Toast["type"]
  /** Its place in the stack, 0 for the newest. */
  index: number
  /** Whether it's the newest, on top of a collapsed stack. A closing toast keeps it. */
  front: boolean
  /** Whether the stack is expanded. */
  expanded: boolean
  /** Whether it's animating out. */
  leaving: boolean
}

/**
 * An action or close button's state.
 * @stable
 */
type ToastButtonState = {
  /** Whether a Promise its handler returned is still running. */
  pending: boolean
  /** Why its handler failed, until it's pressed again. */
  error?: unknown
}

// A `shortcut` attribute: "none" or an empty one turns the shortcut off.
function shortcutAttribute(attribute: string | null) {
  if (attribute === null) {
    return undefined
  }
  return attribute === "none" || attribute === "" ? null : attribute
}

const toastRegionPrimitive = /* @__PURE__ */ definePrimitive({
  name: "toast",
  options: {
    toaster: "value",
    side: "string",
    align: "string",
    maxVisible: "number",
    expanded: "boolean",
    shortcut: shortcutAttribute,
    pendingAnnouncement: "string",
    // Internal: passed by renderers.
    placed: "boolean",
    label: "string",
  },
  state: initialToastState,
  sync: syncToastState,
  controlled: [],
  // Arrow functions, so TypeScript infers the slot names before it checks the api and the parts.
  api: (context) => toastRegionApi(context),
  slots: (slot) => toastSlots(slot),
  agent: { actions: ["pause"], shown: (state) => hasToasts(state.items) },
})

/**
 * The type of `toastRegion`.
 * @stable
 */
interface ToastRegionPrimitive extends Named<typeof toastRegionPrimitive> {}

/**
 * The toast region primitive, with the slots `region`, `list`, `root`,
 * `title`, `description`, `action`, `close`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const toastRegion: ToastRegionPrimitive = toastRegionPrimitive

/**
 * Props for a toast's action button.
 * @stable
 */
type ToastActionProps = {
  /**
   * Runs when it's pressed, instead of the toast's own `action.onAction`. A returned Promise marks it pending.
   * `details.source` says how it was pressed, for changes made after an `await`.
   */
  onAction?: (event: Event | undefined, details: ToastActionDetails) => unknown
  /**
   * Whether pressing it dismisses the toast.
   * @defaultValue the toast's `action.dismiss`, else true
   */
  dismiss?: boolean
}

/**
 * Props for a toast's close button.
 * @stable
 */
type ToastCloseProps = {
  /**
   * Runs before the toast closes. A returned Promise keeps it open and the button pending until it settles.
   * `details.source` says how it was pressed, for changes made after an `await`.
   */
  action?: (event: Event | undefined, details: ToastActionDetails) => unknown
}

export {
  type ToastActionProps,
  type ToastButtonState,
  type ToastCloseProps,
  type ToastItem,
  toastRegion,
  type ToastRegionOptions,
  type ToastRegionPrimitive,
  type ToastRegionState,
  type ToastState,
}
export {
  createToaster,
  toast,
  type Toast,
  type ToastAction,
  type ToastActionDetails,
  type ToastCancel,
  type ToastDismissDetails,
  type ToastDismissReason,
  type ToastOptions,
  type ToastType,
  type Toaster,
} from "./toaster"
export type { ToastPauseReason } from "./toast-timers"
