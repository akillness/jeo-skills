export { default as AlertDialog } from "./alert-dialog/alert-dialog.svelte"
// The parts are Dialog's: the alert dialog's slots and state are the dialog's.
export { default as AlertDialogTrigger } from "./dialog/dialog-trigger.svelte"
export { default as AlertDialogBackdrop } from "./dialog/dialog-backdrop.svelte"
export { default as AlertDialogContent } from "./dialog/dialog-content.svelte"
export { default as AlertDialogTitle } from "./dialog/dialog-title.svelte"
export { default as AlertDialogDescription } from "./dialog/dialog-description.svelte"
export { default as AlertDialogClose } from "./dialog/dialog-close.svelte"
export { default as AlertDialogShortcut } from "./dialog/dialog-shortcut.svelte"
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
