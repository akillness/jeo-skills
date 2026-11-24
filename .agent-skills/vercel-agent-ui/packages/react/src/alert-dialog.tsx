import type {
  AlertDialogOptions,
  AlertDialogTriggerProps,
  dialog as dialogPrimitive,
} from "@ui-sdk/core/dialog"
// From its own module, so an app with only alert dialogs doesn't carry Dialog's presentation.
import { alertDialog as alertDialogPrimitive } from "@ui-sdk/core/alert-dialog"
import * as React from "react"
import { dialogParts, type TriggerPartProps } from "./dialog-parts"

// The alert dialog's slots and state are the dialog's. Only its options are narrower.
const alertParts = dialogParts(
  alertDialogPrimitive as unknown as typeof dialogPrimitive,
  "AlertDialog"
)

/**
 * The props of `AlertDialog`.
 * @stable
 */
type AlertDialogProps = AlertDialogOptions & { children?: React.ReactNode }

/**
 * A modal dialog that interrupts the user with something important and waits for an answer, like "Delete this
 * file?".
 * @stable
 */
function AlertDialog(props: AlertDialogProps) {
  return (
    <alertParts.Root
      {...(props as React.ComponentProps<typeof alertParts.Root>)}
    />
  )
}

/**
 * The button that opens the alert dialog. A trigger outside the alert dialog connects through `controller`.
 * @stable
 */
function AlertDialogTrigger(
  props: TriggerPartProps & Pick<AlertDialogTriggerProps, "controller">
) {
  return <alertParts.Trigger {...props} />
}

/**
 * A dim behind the alert dialog. Pressing it does nothing.
 * @stable
 */
const AlertDialogBackdrop = alertParts.Backdrop

/**
 * The alert dialog itself, with the `alertdialog` role, named by its title. Put the title, the description
 * and the buttons that answer it inside.
 * @stable
 */
const AlertDialogContent = alertParts.Content

/**
 * The alert dialog's title, which names it. A level 2 heading by default.
 * @stable
 */
const AlertDialogTitle = alertParts.Title

/**
 * Describes the alert dialog while it's rendered. A paragraph by default.
 * @stable
 */
const AlertDialogDescription = alertParts.Description

/**
 * A button that closes the alert dialog, like Cancel or Delete. An `action` runs first, and a Promise it
 * returns keeps the alert dialog open until it settles.
 * @stable
 */
const AlertDialogClose = alertParts.Close

/**
 * Shows a trigger's shortcut inside the trigger.
 * @stable
 */
const AlertDialogShortcut = alertParts.Shortcut

export {
  confirm,
  createAlertDialogController,
  createConfirm,
} from "@ui-sdk/core/alert-dialog"
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
} from "@ui-sdk/core/alert-dialog"

export {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  type AlertDialogProps,
  AlertDialogShortcut,
  AlertDialogTitle,
  AlertDialogTrigger,
}
