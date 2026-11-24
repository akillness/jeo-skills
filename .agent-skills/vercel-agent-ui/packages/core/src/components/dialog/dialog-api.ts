// Dialog's behavior, shared with Drawer: opening and closing through the
// popup layer, nesting, focus, dismissal policy, Close actions and trigger
// shortcuts. `dialog.ts` and `drawer.ts` define their primitives on it, and
// `dialog-parts.ts` holds the parts they share.
import { announcePending, runAction } from "../../foundation/kernel/action"
import { measureViewportEarly } from "../../foundation/platform/keyboard"
import type { Layer } from "../../foundation/platform/layers"
import { measureScrollerEarly } from "../../foundation/popups/modal"
import { isBrowser } from "../../foundation/platform/env"
import { activeElement } from "../../foundation/platform/platform"
import {
  createPopup,
  type PopupState,
} from "../../foundation/popups/create-popup"
import type { PopupCloseReason } from "../../foundation/popups/popup"
import {
  alertDialogPreset,
  type dialogPreset,
  type drawerPreset,
} from "../../foundation/popups/popup-presets"
import type { SheetConfig } from "../../foundation/popups/presentation"
import { isTabbable } from "../../foundation/focus/tabbable"
import { isDismissal } from "../../foundation/kernel/details"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import type {
  DialogCloseProps,
  DialogDismissReason,
  DialogOpenChangeReason,
  DialogOptions,
  DialogSharedOptions,
  DialogTriggerProps,
} from "./dialog"
import { log } from "../../foundation/kernel/change"
import { changeSource } from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"
import { shortcutOf } from "../../foundation/shortcuts/shortcut-slot"

type TriggerProps = DialogTriggerProps
type CloseProps = DialogCloseProps

type DialogState = PopupState & {
  // Options that affect rendering, so a change re-renders.
  modal: boolean | "trap-focus"
  // Opened from inside another dialog, and how many dialogs are open above it.
  nested: boolean
  stack: number
  // The Close part whose action is running, and why actions failed, by part.
  pending: string | null
  errors: Record<string, unknown>
  // Apple keyboard conventions for shortcut hints. Neutral until the client binds.
  apple: boolean
  // How it presents while open, decided as it opens. A drawer is always a sheet.
  presentation: "dialog" | "sheet"
}

// What a dialog shows other dialogs nested inside it or around it.
type Nesting = {
  close: (reason: DialogOpenChangeReason) => void
  stack: () => number
  add: (child: Nesting) => void
  remove: (child: Nesting) => void
}

// Open dialogs by their layer, so a dialog opened from inside another finds it.
const dialogLayers = new WeakMap<Layer, Nesting>()

// Every content part built on Dialog. Keys from one nested inside another
// bubble through both, and only the innermost handles them.
const ownContent = [
  '[data-slot="dialog-content"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="drawer-content"]',
].join(",")

// What a running action lets close the dialog: the controller, the action
// itself, and the dialog it's nested in.
const closesWhilePending = ["imperative", "action", "parent-close"]

/**
 * How Dialog refuses a close, for `createDismissal`. A running action refuses
 * every close but the ones above. A dismissal needs `dismissible`, and an
 * outside press needs `closeOnOutsidePress` too. Refused dismissals are
 * attempts the app hears about, except a press beside a non-modal dialog,
 * which is the page's.
 */
function dialogRefusal(
  reason: string,
  policy: {
    dismissible: boolean
    outsidePress: boolean
    pending: boolean
    beside: boolean
  }
) {
  const dismissal = isDismissal(reason)
  const refused =
    (policy.pending && !closesWhilePending.includes(reason)) ||
    (dismissal &&
      (!policy.dismissible ||
        (reason === "outside-press" && !policy.outsidePress)))
  if (!refused) {
    return undefined
  }
  return dismissal && !(reason === "outside-press" && policy.beside)
    ? "attempt"
    : "silent"
}

// Elements from `persistentElements`.
function resolveElements(list: DialogOptions["persistentElements"]) {
  if (!list || !isBrowser) {
    return []
  }
  if (typeof list === "function") {
    return list()
  }
  return list.flatMap((item) =>
    typeof item === "string"
      ? Array.from(document.querySelectorAll(item))
      : [item]
  )
}

/** What a component built on Dialog adds to its behavior, like a sheet. */
type DialogRules = {
  /** Its preset: `dialogPreset`, which presents as a sheet, or Drawer's. Alert Dialog's is the default, so it doesn't carry a sheet's code. */
  preset?: typeof dialogPreset | typeof drawerPreset
  /** More of what its content binds with, like the sheet it presents as. */
  bind?: () => Partial<SheetConfig>
  /** Runs when the popup shows, with its layer. Returns a cleanup. */
  onShow?: (layer: Layer) => (() => void) | void
  /** Runs on open before it mounts, and on close before it animates out. */
  onOpenChange?: (open: boolean) => void
  /** Runs before a dismissal is decided. Return true to handle it instead, like a sheet stepping down on Android's back. */
  intercept?: (reason: PopupCloseReason, event?: Event) => boolean
  /** Runs after a dismissal was refused, after `onDismissAttempt`. */
  onRefuse?: (reason: DialogDismissReason) => void
}

// A dialog is `createPopup` with a dialog preset. What's its own: nesting, the
// dismissal policy, Close actions that keep it open while they run, where
// focus starts, and trigger shortcuts.
function dialogApiBody(
  context: PrimitiveContext<DialogSharedOptions, DialogState, string>,
  alert: boolean,
  extra: DialogRules = {}
) {
  const { store, element } = context
  const options = context.options as () => DialogOptions
  announcePending(context, () => store.get().pending !== null)

  const modal = () => store.get().modal
  // Counts closes, so a Close action that outlives the open it started in changes nothing.
  let session = 0
  const closesOnOutsidePress = () =>
    !alert && (options().closeOnOutsidePress ?? modal() !== false)

  // Dialogs nested inside this one, and the one this is nested in.
  let parent: Nesting | undefined
  const children = new Set<Nesting>()
  function restack() {
    const stack = children.size
      ? Math.max(...[...children].map((child) => child.stack() + 1))
      : 0
    if (stack === store.get().stack) {
      return
    }
    store.set({ stack })
    parent?.add(nesting)
  }
  const nesting: Nesting = {
    close: (reason) => control.hide({ reason }),
    stack: () => store.get().stack,
    add(child) {
      children.add(child)
      restack()
    },
    remove(child) {
      children.delete(child)
      restack()
    },
  }

  // Dialog's options are its shared ones plus each component's callbacks, which list Dialog's reasons.
  const popup = createPopup(
    context as unknown as PrimitiveContext<DialogOptions, DialogState, string>,
    {
      // A modal dialog wraps Tab, pauses the page's shortcuts and blocks the
      // page, its trigger included. A non-modal one is part of the page, and
      // focus leaving doesn't close it. Either stays open whatever has focus.
      preset: extra.preset ?? alertDialogPreset,
      role: alert ? "alertdialog" : "dialog",
      rules: (core) => ({
        persistent: () => resolveElements(options().persistentElements),
        onEscape(event) {
          // A non-modal dialog closes on Escape only while focus is inside it.
          if (
            modal() === false &&
            !core.popup.element()?.contains(activeElement())
          ) {
            return
          }
          core.control.hide({ reason: "escape-key", event })
        },
        onShow(layer) {
          dialogLayers.set(layer, nesting)
          parent = undefined
          for (let up = layer.parent; up && !parent; up = up.parent) {
            parent = dialogLayers.get(up)
          }
          parent?.add(nesting)
          store.set({ nested: !!parent })
          const cleanup = extra.onShow?.(layer)
          return () => {
            cleanup?.()
            dialogLayers.delete(layer)
          }
        },
        onOpenChange(open) {
          extra.onOpenChange?.(open)
          if (open) {
            // The scroll lock's and the keyboard's reads, before anything renders,
            // while they're free. Read after, they lay out the whole page.
            if (isBrowser) {
              const doc = core.triggerElement()?.ownerDocument ?? document
              if (modal() === true) {
                measureScrollerEarly(doc)
              }
              measureViewportEarly(doc.defaultView)
            }
            return
          }
          session++
          store.set({ pending: null })
          // Nested dialogs close first, so their focus returns inside this one before it leaves.
          for (const child of [...children]) {
            child.close("parent-close")
          }
          parent?.remove(nesting)
          parent = undefined
        },
        // Close parts' errors are from the last time it was open.
        open(_, open) {
          store.set({ errors: {} })
          open()
        },
        // How Dialog refuses a close, before any rule hears it.
        refusal: (reason) =>
          dialogRefusal(reason, {
            dismissible: options().dismissible !== false,
            outsidePress: closesOnOutsidePress(),
            pending: store.get().pending !== null,
            beside: modal() !== true && !alert,
          }),
        refused: (reason) => extra.onRefuse?.(reason as DialogDismissReason),
        dismiss(reason, details) {
          if (!extra.intercept?.(reason, details.event)) {
            core.control.hide({ reason, ...details })
          }
        },
        // `"auto"` focuses an autofocused element first, and an alert dialog its
        // least destructive action, before the first focusable element.
        preferredFocus() {
          const content = core.popup.element()
          const auto = content?.querySelector<HTMLElement>(
            "[autofocus], [data-autofocus]"
          )
          if (auto && isTabbable(auto)) {
            return auto
          }
          if (alert) {
            return elements(context, "close").find(({ el }) => isTabbable(el))
              ?.el
          }
        },
        bind: extra.bind,
      }),
    }
  )
  const { control } = popup.internal

  // A Close part was pressed. Its action runs first, and a Promise keeps the dialog open until it settles.
  function closePress(key: string, props: CloseProps, event?: Event) {
    if (!store.get().open || store.get().pending !== null) {
      return
    }
    const action = props.action
    if (!action) {
      return control.hide({
        reason: "close-press",
        event,
        returnValue: props.value,
      })
    }
    const { [key]: _, ...errors } = store.get().errors
    store.set({ errors })
    const source = changeSource("action", event)
    // A close after waiting has no event: the press is long over.
    let waited = false
    const started = session
    runAction((details) => action(event, details), source, {
      pending(pending) {
        if (started !== session) {
          return
        }
        waited = true
        store.set({ pending: pending ? key : null })
        log(context, "pending", pending, { reason: "action", source })
      },
      done() {
        if (started !== session) {
          return
        }
        control.hide({
          reason: "action",
          event: waited ? undefined : event,
          returnValue: props.value,
        })
      },
      failed: (error) => {
        if (started !== session) {
          return
        }
        store.set({ errors: { ...store.get().errors, [key]: error } })
        log(context, "error", error, { reason: "action", source })
      },
    })
  }

  // A trigger's shortcut presses it: it opens the dialog, or closes one that isn't modal.
  function shortcutPress(key: string, event: KeyboardEvent) {
    const props = context.props<TriggerProps>("trigger", key) ?? {}
    if (props.disabled) {
      return
    }
    if (store.get().open) {
      return control.hide({ reason: "shortcut", event })
    }
    control.show({
      event,
      by: "keyboard",
      reason: "shortcut",
      trigger: key,
      payload: props.payload,
    })
  }

  return {
    ...popup,
    // Internal. Used by slots and adapters.
    internal: Object.assign(popup.internal, {
      options,
      show: control.show,
      hide: control.hide,
      takeOver: control.takeOver,
      alert,
      // Where focus goes on open, for a drawer, which binds its content itself.
      initialFocus: () => {
        const { press, popup: layer, contentProps, rules } = popup.internal
        return press.initialFocus(
          layer.element()!,
          contentProps().initialFocus,
          rules?.preferredFocus
        )
      },
      closePress,
      shortcutPress,
      // The shortcut of the trigger an element sits in or beside.
      shortcutOf: (el: HTMLElement) =>
        shortcutOf(context, "trigger", el, { beside: true }),
      backdropElement: () => element("backdrop"),
    }),
  }
}

const dialogApi: (...args: Parameters<typeof dialogApiBody>) => DialogApi =
  dialogApiBody

/**
 * `dialog`'s api, which its slots and controller call. Adapters
 * expose it as `api`.
 * @stable
 */
interface DialogApi extends ReturnType<typeof dialogApiBody> {}

export {
  type DialogApi,
  type DialogRules,
  dialogApi,
  type DialogState,
  dialogRefusal,
  ownContent,
}
