import {
  createPopupController,
  type Modal,
  type PopupFocusTarget,
} from "../../foundation/popups/popup"
import { modalAttribute } from "../../foundation/popups/modal-attribute"
import type { PortalProps } from "../../foundation/platform/position"
import { dialogPreset } from "../../foundation/popups/popup-presets"
import { popupViewport } from "../../foundation/popups/popup-slots"
import type { PresentationSetting } from "../../foundation/popups/presentation"
import type { Sheet } from "../../foundation/popups/sheet"
import type {
  ChangeDetails,
  DismissAttemptDetails,
  DismissReason,
} from "../../foundation/kernel/details"
import type {
  Named,
  PrimitiveOptions,
  SlotFactory,
} from "../../foundation/kernel/primitive-types"
import type { ActionDetails } from "../../foundation/kernel/action"
import type { DialogApi, DialogRules, DialogState } from "./dialog-api"
import { defineDialog } from "./dialog-primitive"
import type { createAlertDialogController } from "./alert-dialog"

/**
 * Why a dialog opened or closed.
 * @stable
 */
type DialogOpenChangeReason =
  | "trigger-press"
  | "close-press"
  | "outside-press"
  | "escape-key"
  | "parent-close"
  | "back"
  | "action"
  | "shortcut"
  | "swipe"
  | "imperative"

/**
 * Why the dialog's payload changed: a trigger opened it, another trigger took a non-modal one over while open, or a controller opened it or gave the open one another payload.
 * @stable
 */
type DialogPayloadChangeReason = "trigger-press" | "shortcut" | "imperative"

/**
 * The ways a user can dismiss a dialog, which `dismissible` and `closeOnOutsidePress` can refuse. A swipe dismisses one presented as a sheet.
 * @stable
 */
type DialogDismissReason = Extract<
  DismissReason,
  "escape-key" | "outside-press" | "back" | "swipe"
>

/**
 * What `onDismissAttempt` receives when a dismissal was refused.
 * @stable
 */
type DialogDismissAttemptDetails = DismissAttemptDetails<DialogDismissReason>

/**
 * Why an alert dialog opened or closed. An outside press never closes one, and it's never a sheet to swipe.
 * @stable
 */
type AlertDialogOpenChangeReason = Exclude<
  DialogOpenChangeReason,
  "outside-press" | "swipe"
>

/**
 * Why the alert dialog's payload changed: a trigger or a controller opened it, or a controller gave the open one another payload.
 * @stable
 */
type AlertDialogPayloadChangeReason = DialogPayloadChangeReason

/**
 * What `onOpenChange` receives after the new open state.
 * @stable
 */
type DialogOpenChangeDetails<Reason extends string = DialogOpenChangeReason> =
  ChangeDetails<Reason> & {
    /** What closed it reported: a Close part's `value`, the button that submitted a form with `method="dialog"`, or `close({ returnValue })`. */
    returnValue?: string
  }

/**
 * Opens, closes and inspects a dialog from outside it: a menu item, a hotkey,
 * a test, or triggers anywhere on the page. Pass it as the `controller`
 * option. `open()` resolves once the dialog closes, with why and any return
 * value. `Payload` is the type of the data triggers and `open()` pass to the content.
 * @stable
 */
function createDialogController<Payload = unknown, Result = string>() {
  return createPopupController<
    Payload,
    DialogOpenChangeReason,
    {},
    Result,
    DialogPayloadChangeReason
  >()
}

/**
 * A controller from `createDialogController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type DialogController<Payload = unknown, Result = string> = ReturnType<
  typeof createDialogController<Payload, Result>
>

/**
 * A controller from `createAlertDialogController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type AlertDialogController<Payload = unknown, Result = string> = ReturnType<
  typeof createAlertDialogController<Payload, Result>
>

/**
 * What the overlay host's alert dialog shows when `confirm()` asks without one of yours.
 * @stable
 */
type ConfirmOptions = {
  /** The question, like "Delete this project?". */
  title: string
  /** What agreeing does. */
  description?: string
  /**
   * The agreeing button's text.
   * @defaultValue "Continue"
   */
  confirmLabel?: string
  /**
   * The other button's text.
   * @defaultValue "Cancel"
   */
  cancelLabel?: string
}

/**
 * The `data` of a `"confirm"` overlay entry: what an overlay host gets for
 * a question `confirm()` asks, to render it as an alert dialog.
 * @stable
 */
type ConfirmEntry<Payload = ConfirmOptions> = {
  /** Pass to the alert dialog the host renders. */
  controller: AlertDialogController<Payload>
  /** The question. */
  payload: Payload | undefined
  /** Call once the alert dialog is rendered with the controller. It opens it and answers. */
  open: () => void
  /** Call once the dialog has finished closing, so the host stops rendering it. */
  done: () => void
}

/**
 * Where focus goes when the dialog opens. `"auto"` picks an element with
 * `autofocus`, else the first focusable element, else the dialog itself; an
 * alert dialog starts on its first Close part, the least destructive action.
 * `"content"` focuses the dialog itself and `"none"` leaves focus where it
 * is. A CSS selector, an element or a function picks a specific element.
 * @stable
 */
type DialogInitialFocus =
  | "auto"
  | "content"
  | "none"
  | (string & {})
  | HTMLElement
  | (() => HTMLElement | null | undefined)

/**
 * Where focus goes when the dialog closes. `"trigger"` returns it to the
 * trigger, or the nearest element that survived when the trigger is gone.
 * `"none"` leaves it. A CSS selector, an element or a function picks a specific element.
 * @stable
 */
type DialogFinalFocus = PopupFocusTarget

/**
 * The options dialogs and alert dialogs share.
 * @stable
 */
type DialogSharedOptions = PortalProps & {
  /** Whether the dialog is open. Pass it to control the dialog. */
  open?: boolean
  /**
   * Whether the dialog starts open, when uncontrolled. Focus moves into it once it's on the page.
   * @defaultValue false
   */
  defaultOpen?: boolean
  /** Runs once the dialog has finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
  /**
   * Whether Escape, an outside press and Android's back gesture can close the dialog. Close parts,
   * triggers and the controller always can. Pass `false` while a form has unsaved changes, and ask
   * in `onDismissAttempt`.
   * @defaultValue true
   */
  dismissible?: boolean
  /** Runs when a dismissal was refused, because `dismissible` is false, an outside press doesn't close it, or a Close part's action is running. Ask "Discard changes?" here. */
  onDismissAttempt?: (details: DialogDismissAttemptDetails) => void
  /**
   * Elements that stay usable while the dialog makes the page inert, like a chat launcher or a
   * password manager's button. Elements, CSS selectors, or a function that returns elements, read
   * when the dialog opens. Presses on them never close it.
   */
  persistentElements?: (Element | string)[] | (() => Element[])
  /**
   * What screen readers hear once a Close part's action has been running for a second, so a slow
   * action doesn't pass in silence. Set it in the page's language. An empty string says nothing.
   * @defaultValue "Loading"
   */
  pendingAnnouncement?: string
} & PrimitiveOptions

/**
 * The options `dialog` takes. A component takes them as props on its root.
 * @stable
 */
type DialogOptions = DialogSharedOptions & {
  /** Runs when the dialog wants to open or close. `details.reason` says why, `details.cancel()` stops it, and `details.returnValue` carries what closed it. */
  onOpenChange?: (open: boolean, details: DialogOpenChangeDetails) => void
  /**
   * Runs when the payload the content shows changes: a trigger with another payload opens the
   * dialog, or takes a non-modal dialog over while it's open, which fires no `onOpenChange`, and so
   * does a controller's `open({ payload })` on the open dialog. `details.cancel()` keeps the previous payload.
   */
  onPayloadChange?: (
    payload: unknown,
    details: ChangeDetails<DialogPayloadChangeReason>
  ) => void
  /**
   * `true`: the rest of the page is inert and doesn't scroll, focus is trapped, and an outside press only closes the dialog. `"trap-focus"`: traps focus, and leaves the page scrollable and clickable. `false`: a dialog beside the page, which Tab can leave and outside presses don't close.
   * @defaultValue true
   */
  modal?: Extract<Modal, boolean | "trap-focus">
  /**
   * Whether pressing outside the dialog, like on its backdrop, closes it. The press counts once it's released outside too, so dragging a text selection out of a field doesn't close it.
   * @defaultValue true, or false when `modal` is false
   */
  closeOnOutsidePress?: boolean
  /**
   * How the dialog presents. `"sheet"` slides it up from the bottom of the screen, where it can be swiped away, and `"auto"` does that on small touch screens. Decided each time it opens; the server renders `"dialog"` for `"auto"`.
   * @defaultValue "dialog"
   */
  presentation?: PresentationSetting<"dialog">
  /** Opens, closes and inspects the dialog from anywhere, and connects triggers outside it. Create one with `createDialogController()`. */
  controller?: DialogController<any, any>
}

/**
 * The options `alertDialog` takes. A component takes them as props on its
 * root.
 * @stable
 */
type AlertDialogOptions = DialogSharedOptions & {
  /** Runs when the alert dialog wants to open or close. `details.reason` says why, `details.cancel()` stops it, and `details.returnValue` is the `value` of the Close part that closed it. */
  onOpenChange?: (
    open: boolean,
    details: DialogOpenChangeDetails<AlertDialogOpenChangeReason>
  ) => void
  /**
   * Runs when a trigger or a controller with another payload opens the alert dialog, before
   * `onOpenChange`, or a controller's `open({ payload })` gives the open one another payload.
   * `details.cancel()` keeps the previous payload.
   */
  onPayloadChange?: (
    payload: unknown,
    details: ChangeDetails<AlertDialogPayloadChangeReason>
  ) => void
  /** Opens, closes and inspects the alert dialog from anywhere. Create one with `createAlertDialogController()` or `createConfirm()`. */
  controller?: AlertDialogController<any, any>
}

type TriggerProps = {
  /**
   * Stops the trigger from opening the dialog. A native button can't be focused or pressed, unless `focusableWhenDisabled` is set.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Keeps a disabled trigger in the tab order with `aria-disabled` instead of the native attribute, so it can host a tooltip that says why. Presses still do nothing.
   * @defaultValue false
   */
  focusableWhenDisabled?: boolean
  /** Data for the content to render when this trigger opens the dialog, like the row it belongs to. */
  payload?: unknown
  /**
   * A keyboard shortcut that presses the trigger, like `"mod+k"`. `mod` is Command on Apple platforms
   * and Control elsewhere. Sets `aria-keyshortcuts`, and a Shortcut part inside shows it. A modal
   * dialog pauses the page's shortcuts while it's open.
   */
  shortcut?: string
}

type ContentProps = PortalProps & {
  /**
   * Where focus goes when the dialog opens. Opening with touch focuses the dialog itself, so no on-screen keyboard appears.
   * @defaultValue "auto"
   */
  initialFocus?: DialogInitialFocus
  /**
   * Where focus goes when the dialog closes while focus is inside it.
   * @defaultValue "trigger"
   */
  finalFocus?: DialogFinalFocus
  /**
   * Whether the dialog stays in the page, hidden, while closed. Its content keeps its state between opens.
   * @defaultValue false
   */
  keepMounted?: boolean
  /**
   * Renders the dialog and its backdrop where they are in the page instead of above it, so it can stay inside a frame, like an app preview. Pair it with `modal="trap-focus"` to keep the rest of the page usable. A `container` on the dialog still moves its backdrop, so leave it off.
   * @defaultValue false
   */
  inline?: boolean
}

type CloseProps = {
  /** Reported as `returnValue` in `onOpenChange` and by the controller's `open()`. `createConfirm()` resolves `true` for `"confirm"`. */
  value?: string
  /**
   * Runs when the part is pressed, before the dialog closes. A returned Promise keeps the dialog
   * open while it runs: the part gets `data-pending`, `aria-busy` and `aria-disabled`, screen readers
   * hear the dialog's `pendingAnnouncement` after a second, and nothing but the controller closes
   * the dialog. It closes with reason `"action"` once the Promise resolves. A rejection keeps
   * it open and puts the reason in the part's `error` state until the next press, or until the
   * dialog opens again. `details.source` says how the part was pressed, for changes made after an `await`.
   */
  action?: (event: Event | undefined, details: ActionDetails) => unknown
}

type ShortcutProps = {
  /** The keys to show. Inside a trigger, its `shortcut`. */
  shortcut?: string
}

/**
 * The props the `trigger` slot of `dialog` takes.
 * @stable
 */
type DialogTriggerProps = TriggerProps & {
  /** Connects a trigger outside the dialog, like one per table row, to the dialog with this controller. */
  controller?: DialogController<any, any>
}
/**
 * The props the `content` slot of `dialog` takes.
 * @stable
 */
type DialogContentProps = ContentProps
/**
 * The props the `close` slot of `dialog` takes.
 * @stable
 */
type DialogCloseProps = CloseProps
/**
 * What a `close` part's `action` receives after the event: how the part was pressed.
 * @experimental
 */
type DialogCloseActionDetails = ActionDetails
/**
 * The props the `shortcut` slot of `dialog` takes.
 * @stable
 */
type DialogShortcutProps = ShortcutProps
/**
 * The props the `trigger` slot of `alertDialog` takes.
 * @stable
 */
type AlertDialogTriggerProps = TriggerProps & {
  /** Connects a trigger outside the alert dialog to the alert dialog with this controller. */
  controller?: AlertDialogController<any, any>
}
/**
 * The props the `content` slot of `alertDialog` takes.
 * @stable
 */
type AlertDialogContentProps = ContentProps
/**
 * The props the `close` slot of `alertDialog` takes.
 * @stable
 */
type AlertDialogCloseProps = CloseProps
/**
 * What a `close` part's `action` receives after the event: how the part was pressed.
 * @experimental
 */
type AlertDialogCloseActionDetails = ActionDetails
/**
 * The props the `shortcut` slot of `alertDialog` takes.
 * @stable
 */
type AlertDialogShortcutProps = ShortcutProps

/**
 * The state the `trigger` slot of `dialog` hands `render` functions and
 * state-based class names.
 * @stable
 */
type DialogTriggerState = {
  /** Whether the dialog is open from this trigger. */
  open: boolean
  /** Set by the trigger's `disabled` prop, which stops it opening the dialog. */
  disabled: boolean
}
/**
 * The state the `backdrop` slot of `dialog` hands `render` functions and
 * state-based class names.
 * @stable
 */
type DialogBackdropState = {
  /** Whether the dialog is open. False while it animates out. */
  open: boolean
  /** Whether the dialog was opened from inside another dialog. */
  nested: boolean
  /** Whether a dialog opened from inside this one is open. */
  nestedOpen: boolean
}
/**
 * The state the `content` slot of `dialog` hands `render` functions and
 * state-based class names.
 * @stable
 */
type DialogContentState<Payload = unknown> = {
  /** Whether the dialog is open. False while it animates out. */
  open: boolean
  /** The `modal` setting. Always true for an alert dialog. */
  modal: boolean | "trap-focus"
  /** Whether the dialog was opened from inside another dialog. */
  nested: boolean
  /** Whether a dialog opened from inside this one is open. */
  nestedOpen: boolean
  /** How many dialogs are open above this one, nested inside it. */
  stack: number
  /**
   * The payload of the last open, from the trigger that opened it or a
   * controller, typed as the controller's `Payload`.
   */
  payload: Payload | undefined
  /** Whether a Close part's action is running. */
  pending: boolean
  /** How it presents this time it's open. */
  presentation: "dialog" | "sheet"
}
/**
 * The state the `close` slot of `dialog` hands `render` functions and
 * state-based class names.
 * @stable
 */
type DialogCloseState = {
  /** Whether this part's action is running. */
  pending: boolean
  /** Why this part's last action failed, until it's pressed again or the dialog opens again. */
  error: unknown
}
/**
 * The state the `shortcut` slot of `dialog` hands `render` functions and
 * state-based class names.
 * @stable
 */
type DialogShortcutState = {
  /** The shortcut formatted for this platform: `⌘K` on Apple platforms and `Ctrl+K` elsewhere. Empty without one. */
  text: string
}
/**
 * The state the `trigger` slot of `alertDialog` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AlertDialogTriggerState = DialogTriggerState
/**
 * The state the `backdrop` slot of `alertDialog` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AlertDialogBackdropState = DialogBackdropState
/**
 * The state the `content` slot of `alertDialog` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AlertDialogContentState<Payload = unknown> = Omit<
  DialogContentState<Payload>,
  "presentation"
> & {
  /** Always `"dialog"`: an alert dialog never presents as a sheet. */
  presentation: "dialog"
}
/**
 * The state the `close` slot of `alertDialog` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AlertDialogCloseState = DialogCloseState
/**
 * The state the `shortcut` slot of `alertDialog` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AlertDialogShortcutState = DialogShortcutState

// A dialog's presentation, which an alert dialog and a drawer don't carry. A
// refused dismissal nudges the sheet.
const presentable = {
  rules() {
    let sheet: Sheet | undefined
    return {
      preset: dialogPreset,
      bind: () => ({ onSheet: (next: Sheet | undefined) => (sheet = next) }),
      onRefuse: () => sheet?.nudge(),
    } satisfies DialogRules
  },
  slots: (slot: SlotFactory<DialogState, DialogApi>) => ({
    viewport: popupViewport(slot),
  }),
}

const dialogPrimitive = /* @__PURE__ */ defineDialog<
  DialogOptions,
  ReturnType<typeof presentable.slots>
>(
  "dialog",
  false,
  {
    onOpenChange: "callback",
    onPayloadChange: "callback",
    modal: modalAttribute,
    closeOnOutsidePress: "boolean",
    presentation: "string",
    controller: "value",
  },
  presentable
)

/**
 * The type of `dialog`.
 * @stable
 */
interface DialogPrimitive extends Named<typeof dialogPrimitive> {}

/**
 * The dialog primitive, with the slots `trigger`, `backdrop`, `content`,
 * `title`, `description`, `close`, `shortcut`, `viewport`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const dialog: DialogPrimitive = dialogPrimitive

export {
  type AlertDialogBackdropState,
  type AlertDialogCloseActionDetails,
  type AlertDialogCloseProps,
  type AlertDialogCloseState,
  type AlertDialogContentProps,
  type AlertDialogContentState,
  type AlertDialogController,
  type AlertDialogOpenChangeReason,
  type AlertDialogOptions,
  type AlertDialogPayloadChangeReason,
  type AlertDialogShortcutProps,
  type AlertDialogShortcutState,
  type AlertDialogTriggerProps,
  type AlertDialogTriggerState,
  type ConfirmEntry,
  type ConfirmOptions,
  createDialogController,
  dialog,
  dialogPreset,
  type DialogBackdropState,
  type DialogCloseActionDetails,
  type DialogCloseProps,
  type DialogCloseState,
  type DialogContentProps,
  type DialogContentState,
  type DialogController,
  type DialogDismissAttemptDetails,
  type DialogDismissReason,
  type DialogFinalFocus,
  type DialogInitialFocus,
  type DialogOpenChangeDetails,
  type DialogOpenChangeReason,
  type DialogOptions,
  type DialogPayloadChangeReason,
  type DialogPrimitive,
  type DialogSharedOptions,
  type DialogShortcutProps,
  type DialogShortcutState,
  type DialogTriggerProps,
  type DialogTriggerState,
}
export type { DialogApi } from "./dialog-api"
export {
  alertDialog,
  type AlertDialogPrimitive,
  confirm,
  createAlertDialogController,
  createConfirm,
} from "./alert-dialog"
