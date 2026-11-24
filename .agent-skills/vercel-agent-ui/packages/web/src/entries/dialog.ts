// Importing this defines <ui-dialog> and its parts. On the server it does nothing.
import { defineDialogElements } from "../dialog"

defineDialogElements()

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
export type { DialogEvents, UiDialogElement } from "../events"
export { createDialogController } from "@ui-sdk/core/dialog"
