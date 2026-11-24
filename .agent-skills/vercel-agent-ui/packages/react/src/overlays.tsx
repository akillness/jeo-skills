import type { ConfirmEntry, ConfirmOptions } from "@ui-sdk/core/dialog"
import {
  overlays as sharedOverlays,
  type OverlayEntry,
  type Overlays,
} from "@ui-sdk/core/overlays"
import { toasterInternals, type Toaster } from "@ui-sdk/core/renderer"
import * as React from "react"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./alert-dialog"
import { Region, type ToastRegionProps } from "./toast-parts"

const noEntries: readonly OverlayEntry[] = []

/**
 * Props for `OverlayHost`.
 * @stable
 */
type OverlayHostProps = {
  /**
   * The registry it renders.
   * @defaultValue the shared `overlays`, which `toast()` and `confirm()` open into
   */
  overlays?: Overlays
  /** Props for the toast regions it renders, like `side`, `className` and `children`. */
  toast?: Omit<ToastRegionProps, "toaster">
}

/**
 * Renders what `toast()` and `confirm()` open, from anywhere in the app.
 * Mount it once, near the root. A `ToastRegion` you place yourself takes over
 * its toaster.
 * @stable
 */
function OverlayHost({ overlays = sharedOverlays, toast }: OverlayHostProps) {
  const entries = React.useSyncExternalStore(
    overlays.subscribe,
    overlays.entries,
    () => noEntries
  )
  React.useLayoutEffect(() => overlays.attachHost(), [overlays])
  return entries.map((entry) => {
    if (entry.type === "toaster") {
      return (
        <HostedToaster
          key={entry.id}
          {...(entry.data as { toaster: Toaster })}
          props={toast}
        />
      )
    }
    if (entry.type === "confirm") {
      return <HostedConfirm key={entry.id} entry={entry.data as ConfirmEntry} />
    }
    return null
  })
}

function HostedToaster({
  toaster,
  props,
}: {
  toaster: Toaster
  props?: Omit<ToastRegionProps, "toaster">
}) {
  const placed = React.useSyncExternalStore(
    toaster.subscribe,
    () => toasterInternals(toaster).hasPlacedRegion(),
    () => false
  )
  if (placed) {
    return null
  }
  return <Region {...props} toaster={toaster} placed={false} />
}

function HostedConfirm({ entry }: { entry: ConfirmEntry }) {
  // The alert dialog attached the controller in its layout effect, so it can open now.
  React.useEffect(() => {
    entry.open()
  }, [entry])
  const question = (entry.payload ?? {}) as Partial<ConfirmOptions>
  return (
    <AlertDialog
      controller={entry.controller}
      onOpenChangeComplete={(open) => !open && entry.done()}
    >
      <AlertDialogContent>
        <AlertDialogTitle>{question.title}</AlertDialogTitle>
        {question.description && (
          <AlertDialogDescription>
            {question.description}
          </AlertDialogDescription>
        )}
        <div>
          <AlertDialogClose>
            {question.cancelLabel ?? "Cancel"}
          </AlertDialogClose>
          <AlertDialogClose value="confirm">
            {question.confirmLabel ?? "Continue"}
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { createOverlays, overlays } from "@ui-sdk/core/overlays"
export type { OverlayEntry, Overlays } from "@ui-sdk/core/overlays"

export { OverlayHost, type OverlayHostProps }
