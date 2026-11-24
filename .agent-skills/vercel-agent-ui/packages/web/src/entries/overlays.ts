// Importing this defines <ui-overlay-host>, with the toast and alert dialog elements it renders. On the server it does nothing.
import { defineOverlayHostElements } from "../overlays"

defineOverlayHostElements()

export type { OverlayEntry, Overlays } from "@ui-sdk/core/overlays"
export type {
  AlertDialogEvents,
  UiAlertDialogElement,
  UiOverlayHostElement,
  UiToastRegionElement,
} from "../events"
