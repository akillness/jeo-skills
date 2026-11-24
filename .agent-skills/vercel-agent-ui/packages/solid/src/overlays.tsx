import type { ConfirmEntry, ConfirmOptions } from "@ui-sdk/core/dialog"
import {
  overlays as sharedOverlays,
  type OverlayEntry,
  type Overlays,
} from "@ui-sdk/core/overlays"
import { toasterInternals, type Toaster } from "@ui-sdk/core/renderer"
import { createEffect, createSignal, For, Show, untrack } from "solid-js"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./alert-dialog"
import { Region, type ToastRegionProps } from "./toast-parts"

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
  /** Props for the toast regions it renders, like `side`, `class` and `children`. */
  toast?: Omit<ToastRegionProps, "toaster">
}

/**
 * Renders what `toast()` and `confirm()` open, from anywhere in the app.
 * Mount it once, near the root. A `ToastRegion` you place yourself takes over
 * its toaster.
 * @stable
 */
function OverlayHost(props: OverlayHostProps) {
  const registry = () => props.overlays ?? sharedOverlays
  // Nothing until mounted, as on the server, so the first client render
  // hydrates against the server's and the host counts itself only on the client.
  // Set from the registry's listeners, which fire from core's lifecycle,
  // cleanups and disposals included.
  const [entries, setEntries] = createSignal<readonly OverlayEntry[]>([], {
    ownedWrite: true,
  })
  createEffect(registry, (current) => {
    const update = () => setEntries(current.entries())
    update()
    const unsubscribe = current.subscribe(update)
    const release = current.attachHost()
    return () => {
      unsubscribe()
      release()
    }
  })
  return (
    <For each={entries()}>
      {(entry) =>
        entry.type === "toaster" ? (
          <HostedToaster
            toaster={(entry.data as { toaster: Toaster }).toaster}
            region={props.toast}
          />
        ) : entry.type === "confirm" ? (
          <HostedConfirm entry={entry.data as ConfirmEntry} />
        ) : null
      }
    </For>
  )
}

// A toaster's region, unless the app placed one of its own.
function HostedToaster(props: {
  toaster: Toaster
  region?: Omit<ToastRegionProps, "toaster">
}) {
  // Set from the toaster's listeners, like a placed region unbinding during a disposal.
  const [placed, setPlaced] = createSignal(
    untrack(() => toasterInternals(props.toaster).hasPlacedRegion()),
    {
      ownedWrite: true,
    }
  )
  createEffect(
    () => props.toaster,
    (toaster) => {
      const update = () =>
        setPlaced(toasterInternals(toaster).hasPlacedRegion())
      update()
      return toaster.subscribe(update)
    }
  )
  return (
    <Show when={!placed()}>
      <Region {...props.region} toaster={props.toaster} placed={false} />
    </Show>
  )
}

function HostedConfirm(props: { entry: ConfirmEntry }) {
  // The alert dialog attaches the controller from its own effect, in the
  // same flush as this one, so the question opens once the flush is done.
  createEffect(
    () => props.entry,
    (entry) => {
      let opening = true
      queueMicrotask(() => {
        if (!opening) {
          return
        }
        opening = false
        entry.open()
      })
      return () => {
        if (!opening) {
          return
        }
        opening = false
        entry.done()
      }
    }
  )
  const question = () => (props.entry.payload ?? {}) as Partial<ConfirmOptions>
  return (
    <AlertDialog
      controller={props.entry.controller}
      onOpenChangeComplete={(open) => !open && props.entry.done()}
    >
      <AlertDialogContent>
        <AlertDialogTitle>{question().title}</AlertDialogTitle>
        <Show when={question().description}>
          <AlertDialogDescription>
            {question().description}
          </AlertDialogDescription>
        </Show>
        <div>
          <AlertDialogClose>
            {question().cancelLabel ?? "Cancel"}
          </AlertDialogClose>
          <AlertDialogClose value="confirm">
            {question().confirmLabel ?? "Continue"}
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { createOverlays, overlays } from "@ui-sdk/core/overlays"
export type { OverlayEntry, Overlays } from "@ui-sdk/core/overlays"

export { OverlayHost, type OverlayHostProps }
