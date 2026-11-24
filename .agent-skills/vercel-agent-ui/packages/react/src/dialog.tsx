import {
  dialog as dialogPrimitive,
  type DialogOptions,
  type DialogTriggerProps,
} from "@ui-sdk/core/dialog"
import * as React from "react"
import { dialogParts, type TriggerPartProps } from "./dialog-parts"
import { sheetViewport } from "./popup"

const parts = dialogParts(dialogPrimitive, "Dialog", sheetViewport)

/**
 * The props of `Dialog`.
 * @stable
 */
type DialogProps = DialogOptions & { children?: React.ReactNode }

/**
 * A window over the page that asks for the user's attention. Put its trigger, backdrop and content inside.
 * @stable
 */
const Dialog = parts.Root

/**
 * The button that opens the dialog. A trigger outside the dialog, like one per table row, connects through
 * `controller`.
 * @stable
 */
function DialogTrigger(
  props: TriggerPartProps & Pick<DialogTriggerProps, "controller">
) {
  return <parts.Trigger {...props} />
}

/**
 * A dim behind the dialog. It's optional: without it, style the content's `::backdrop`.
 * @stable
 */
const DialogBackdrop = parts.Backdrop

/**
 * The dialog itself, named by its title and described by its description.
 * @stable
 */
const DialogContent = parts.Content

/**
 * The dialog's title, which names it. A level 2 heading by default.
 * @stable
 */
const DialogTitle = parts.Title

/**
 * Describes the dialog while it's rendered. A paragraph by default.
 * @stable
 */
const DialogDescription = parts.Description

/**
 * A button that closes the dialog. An `action` runs first, and a Promise it returns keeps the dialog open
 * until it settles.
 * @stable
 */
const DialogClose = parts.Close

/**
 * Shows a trigger's shortcut, like `⌘K`, inside the trigger. Hidden from screen readers, which hear `aria-keyshortcuts`.
 * @stable
 */
const DialogShortcut = parts.Shortcut

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
