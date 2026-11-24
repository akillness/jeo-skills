// Alert Dialog: Dialog's parts and behavior, always modal, never closed by an
// outside press and never presented as a sheet, and `confirm()` on top of it.
// `@ui-sdk/core/dialog` exports all of it. Adapters import it from here, so an
// app with only alert dialogs never carries Dialog's presentation, whose
// sheet code `dialog.ts` imports.
import { createPopupController } from "../../foundation/popups/popup"
import { isControllerAttached } from "../../foundation/kernel/controller"
import type { Named } from "../../foundation/kernel/primitive-types"
import {
  overlays as sharedOverlays,
  type Overlays,
} from "../../page/overlays/overlays"
import type {
  AlertDialogOpenChangeReason,
  AlertDialogOptions,
  AlertDialogPayloadChangeReason,
  ConfirmEntry,
  ConfirmOptions,
} from "./dialog"
import { defineDialog } from "./dialog-primitive"

/**
 * Opens, closes and inspects an alert dialog from outside it. Pass it as the
 * `controller` option. `open()` resolves once it closes, with why and the
 * `value` of the Close part that closed it.
 * @stable
 */
function createAlertDialogController<Payload = unknown, Result = string>() {
  return createPopupController<
    Payload,
    AlertDialogOpenChangeReason,
    {},
    Result,
    AlertDialogPayloadChangeReason
  >()
}

/**
 * Asks a question with an alert dialog and resolves with the answer, for
 * `if (await confirm({ title: "Delete it?" })) remove()`. With your own
 * `AlertDialog`, pass it `confirm.controller` and give the Close part that
 * agrees `value="confirm"`. Without one, the overlay host renders an alert
 * dialog from the options, one question at a time. Any other close, like
 * Cancel or Escape, resolves `false`.
 * @stable
 */
function createConfirm<Payload = ConfirmOptions>({
  overlays = sharedOverlays,
}: {
  /**
   * The registry whose host renders the alert dialog when you render none.
   * @defaultValue the shared `overlays`
   */
  overlays?: Overlays
} = {}) {
  const controller = createAlertDialogController<Payload>()
  // Each question waits for the one before it, so an answer never goes to the wrong question.
  let previous: Promise<unknown> = Promise.resolve()
  let unanswered = 0
  let hosted = false
  const own = () => isControllerAttached(controller) && !hosted

  const ask = (payload?: Payload) =>
    new Promise<boolean>((resolve) => {
      let opened = false
      const id = overlays.mount("confirm", {
        controller,
        payload,
        // Once, even when a framework runs the host's effect twice, like React's StrictMode.
        open: () => {
          if (opened) {
            return
          }
          opened = true
          controller
            .open({ payload })
            .then(({ returnValue }) => resolve(returnValue === "confirm"))
        },
        done: () => {
          hosted = false
          overlays.unmount(id)
          // The open dialog answers itself, even when it settles after this.
          // A host that went away before opening it counts as a no.
          if (!opened) {
            resolve(false)
          }
        },
      } satisfies ConfirmEntry<Payload>)
      hosted = true
    })

  const answer = (payload?: Payload) =>
    own()
      ? controller
          .open({ payload })
          .then(({ returnValue }) => returnValue === "confirm")
      : ask(payload)

  const confirm = (payload?: Payload) => {
    // Your idle alert dialog opens at once, in the press that asked.
    const asked =
      !unanswered && own()
        ? answer(payload)
        : previous.then(() => answer(payload))
    unanswered++
    asked.then(() => unanswered--)
    previous = asked
    return asked
  }
  return Object.assign(confirm, {
    /** The alert dialog's controller. Pass it as the `controller` option of your own alert dialog. */
    controller,
  })
}

/**
 * Asks a question and resolves with the answer, through the overlay host's
 * alert dialog: `if (await confirm({ title: "Delete this project?" })) remove()`.
 * @stable
 */
const confirm = /* @__PURE__ */ createConfirm()

const alertDialogPrimitive = /* @__PURE__ */ defineDialog<AlertDialogOptions>(
  "alert-dialog",
  true,
  {
    onOpenChange: "callback",
    onPayloadChange: "callback",
    controller: "value",
  }
)

/**
 * The type of `alertDialog`.
 * @stable
 */
interface AlertDialogPrimitive extends Named<typeof alertDialogPrimitive> {}

/**
 * The alert dialog primitive, with the slots `trigger`, `backdrop`, `content`,
 * `title`, `description`, `close`, `shortcut`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const alertDialog: AlertDialogPrimitive = alertDialogPrimitive

export {
  alertDialog,
  type AlertDialogPrimitive,
  confirm,
  createAlertDialogController,
  createConfirm,
}
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
  AlertDialogShortcutProps,
  AlertDialogShortcutState,
  AlertDialogTriggerProps,
  AlertDialogTriggerState,
  ConfirmEntry,
  ConfirmOptions,
} from "./dialog"
