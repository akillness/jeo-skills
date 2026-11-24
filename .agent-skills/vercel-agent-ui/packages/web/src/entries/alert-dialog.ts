// Importing this defines <ui-alert-dialog> and its parts. On the server it does nothing.
import { defineAlertDialogElements } from "../dialog"

defineAlertDialogElements()

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
export type { AlertDialogEvents, UiAlertDialogElement } from "../events"
export {
  confirm,
  createAlertDialogController,
  createConfirm,
} from "@ui-sdk/core/alert-dialog"
