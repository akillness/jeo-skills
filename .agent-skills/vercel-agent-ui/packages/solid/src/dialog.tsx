import {
  dialog as dialogPrimitive,
  type DialogOptions,
  type DialogTriggerProps,
} from "@ui-sdk/core/dialog"
import type { JSX } from "@solidjs/web"
import { createDialogParts, type TriggerPartProps } from "./dialog-parts"
import { sheetViewport } from "./popup"

const dialogParts = createDialogParts(dialogPrimitive, "Dialog", sheetViewport)

/**
 * The props of `Dialog`.
 * @stable
 */
type DialogProps = DialogOptions & { children?: JSX.Element }

/**
 * A window over the page that asks for the user's attention. Put its trigger, backdrop and content inside.
 * @stable
 */
function Dialog(props: DialogProps) {
  return <dialogParts.Root {...props} />
}

/**
 * The button that opens the dialog. A trigger outside the dialog, like one per table row, connects through
 * `controller`.
 * @stable
 */
function DialogTrigger(
  props: TriggerPartProps & Pick<DialogTriggerProps, "controller">
) {
  return <dialogParts.Trigger {...props} />
}

/**
 * A dim behind the dialog. It's optional: without it, style the content's `::backdrop`.
 * @stable
 */
const DialogBackdrop = dialogParts.Backdrop

/**
 * The dialog itself, named by its title and described by its description.
 * @stable
 */
const DialogContent = dialogParts.Content

/**
 * The dialog's title, which names it. A level 2 heading by default.
 * @stable
 */
const DialogTitle = dialogParts.Title

/**
 * Describes the dialog while it's rendered. A paragraph by default.
 * @stable
 */
const DialogDescription = dialogParts.Description

/**
 * A button that closes the dialog. An `action` runs first, and a Promise it returns keeps the dialog open
 * until it settles.
 * @stable
 */
const DialogClose = dialogParts.Close

/**
 * Shows a trigger's shortcut, like `⌘K`, inside the trigger. Hidden from screen readers, which hear `aria-keyshortcuts`.
 * @stable
 */
const DialogShortcut = dialogParts.Shortcut

export { createDialogController } from "@ui-sdk/core/dialog"
export type {
  AlertDialogBackdropState,
  AlertDialogCloseActionDetails,
  AlertDialogCloseProps,
  AlertDialogCloseState,
  AlertDialogContentProps,
  AlertDialogContentState,
  AlertDialogController,
  AlertDialogOpenChangeReason,
  AlertDialogOptions,
  AlertDialogPayloadChangeReason,
  AlertDialogPrimitive,
  AlertDialogShortcutProps,
  AlertDialogShortcutState,
  AlertDialogTriggerProps,
  AlertDialogTriggerState,
  ConfirmEntry,
  ConfirmOptions,
  DialogApi,
  DialogBackdropState,
  DialogCloseActionDetails,
  DialogCloseProps,
  DialogCloseState,
  DialogContentProps,
  DialogContentState,
  DialogController,
  DialogDismissAttemptDetails,
  DialogDismissReason,
  DialogFinalFocus,
  DialogInitialFocus,
  DialogOpenChangeDetails,
  DialogOpenChangeReason,
  DialogOptions,
  DialogPayloadChangeReason,
  DialogPrimitive,
  DialogSharedOptions,
  DialogShortcutProps,
  DialogShortcutState,
  DialogTriggerProps,
  DialogTriggerState,
} from "@ui-sdk/core/dialog"

export {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  type DialogProps,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
}
