// Toasts. The region and its parts live in `toast-parts.ts`, which the
// overlay host shares. Core's `Toast` and `ToastAction` types end in `Data`
// here, since the components have their names.
export type {
  Toast as ToastData,
  ToastAction as ToastActionData,
  ToastActionDetails,
  ToastActionProps,
  ToastButtonState,
  ToastCancel,
  ToastCloseProps,
  ToastDismissDetails,
  ToastDismissReason,
  Toaster,
  ToastItem,
  ToastOptions,
  ToastPauseReason,
  ToastRegionOptions,
  ToastRegionPrimitive,
  ToastRegionState,
  ToastState,
  ToastType,
} from "@ui-sdk/core/toast"

export {
  createToaster,
  toast,
  Toast,
  ToastAction,
  ToastClose,
  type ToastContent,
  ToastDescription,
  ToastRegion,
  ToastTitle,
} from "./toast-parts"
