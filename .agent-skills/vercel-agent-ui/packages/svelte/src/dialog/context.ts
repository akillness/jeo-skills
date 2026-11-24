import type { dialog as dialogPrimitive } from "@ui-sdk/core/dialog"
import { getContext } from "svelte"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

// Dialog and AlertDialog render the same parts over their own primitive. The
// parts never import a primitive, so an app with only alert dialogs doesn't
// carry Dialog's presentation. The alert dialog's slots and state are the
// dialog's; only its options are narrower.
type DialogHandle = PrimitiveHandle<typeof dialogPrimitive>

type DialogContext = {
  /** The instance the parts bind to. */
  handle: DialogHandle
  /** `"Dialog"` or `"AlertDialog"`, for messages. */
  name: string
  /** Whether the content renders a viewport around itself when it presents as a sheet. An alert dialog never does. */
  sheet: boolean
  /** Where the popup renders, from the root's `container`. */
  container: () => PopupContainer
}

const DialogKey = Symbol("dialog")
// The trigger a Shortcut part sits in: its shortcut, and the dialog it opens.
// A trigger connected through a controller sits outside the dialog, so its
// dialog comes from here.
const TriggerKey = Symbol("dialog-trigger")

type TriggerContext = {
  shortcut: () => string | undefined
  dialog: () => DialogContext | undefined
}

function useDialog() {
  const context = getContext<DialogContext | undefined>(DialogKey)
  if (!context) {
    throw new Error(
      "Dialog parts must be used inside <Dialog> or <AlertDialog>."
    )
  }
  return context
}

export {
  type DialogContext,
  type DialogHandle,
  DialogKey,
  type TriggerContext,
  TriggerKey,
  useDialog,
}
