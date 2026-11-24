// Importing this defines <ui-toast> and its parts. On the server it does nothing.
import { defineToastElements } from "../toast"

defineToastElements()

export { createToaster, toast, type ToastContent } from "../toast"

export type {
  Toast,
  ToastAction,
  ToastActionDetails,
  ToastActionProps,
  ToastButtonState,
  ToastCancel,
  ToastCloseProps,
  ToastDismissDetails,
  ToastDismissReason,
  ToastItem,
  ToastOptions,
  ToastPauseReason,
  ToastRegionOptions,
  ToastRegionPrimitive,
  ToastRegionState,
  ToastState,
  ToastType,
  Toaster,
} from "@ui-sdk/core/toast"
export type { UiToastRegionElement } from "../events"
