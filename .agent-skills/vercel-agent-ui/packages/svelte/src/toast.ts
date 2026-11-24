import {
  createToaster as createCoreToaster,
  toast as coreToast,
  type Toaster,
} from "@ui-sdk/core/toast"
import type { ToastContent } from "./toast/context"

/**
 * Shows a toast from anywhere: `toast("Saved")`, `toast.success(...)`,
 * `toast.promise(save(), { loading, success, error })`. Content is text or a snippet.
 * @stable
 */
const toast = coreToast as Toaster<ToastContent>

/**
 * Creates a queue of toasts and the function that adds to it, for a second
 * region with its own toasts. Pass it to that region as `toaster`.
 * @stable
 */
const createToaster = createCoreToaster as <Content = ToastContent>(
  options?: Parameters<typeof createCoreToaster>[0]
) => Toaster<Content>

// Core's `Toast` and `ToastAction` types end in `Data` here, since the components have their names.
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

export { createToaster, toast }
export { default as ToastRegion } from "./toast/toast-region.svelte"
export { default as Toast } from "./toast/toast.svelte"
export { default as ToastTitle } from "./toast/toast-title.svelte"
export { default as ToastDescription } from "./toast/toast-description.svelte"
export { default as ToastAction } from "./toast/toast-action.svelte"
export { default as ToastClose } from "./toast/toast-close.svelte"
export type { ToastContent, ToastRegionProps } from "./toast/context"
