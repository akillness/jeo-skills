import { dialog } from "@ui-sdk/core/dialog"
// From its own module, so an app with only alert dialogs doesn't carry Dialog's presentation.
import { alertDialog } from "@ui-sdk/core/alert-dialog"
import { actionOf } from "./action"
import { definePart, createParts, wrappedButton } from "./define-element"
import {
  closesOnOutsidePress,
  popupApi,
  popupKinds,
  popupPortal,
  popupState,
  renderPopupTitle,
  sheetPortal,
} from "./popup"

// container="#id" renders the backdrop and the dialog there, and a dialog's sheet viewport with them.
const portalSlots = ["backdrop", "content"]

// `portal` handles the `container` attribute, so core never gets it.
const ownerOptions = () => ({ container: undefined })

// The parts of <ui-dialog> or <ui-alert-dialog>, named after the owner.
function defineDialogParts(
  primitive: typeof dialog | typeof alertDialog,
  owner: string
) {
  // With `for="dialog-id"`, it opens that dialog from anywhere on the page.
  definePart(primitive, "trigger", {
    tag: `${owner}-trigger`,
    display: "contents",
    target: wrappedButton,
  })
  // With an `action` attribute, pressing it fires a cancelable `action` event.
  // Pass a Promise to `event.detail.waitUntil()` to keep the dialog open, and
  // the part pending, until it settles.
  definePart(primitive, "close", {
    tag: `${owner}-close`,
    display: "contents",
    target: wrappedButton,
    context: (el) =>
      el.hasAttribute("action") ? { action: actionOf(el) } : {},
  })
  // Shows the shortcut of the trigger it's in, or its own `shortcut`, when it has no text of its own.
  definePart(primitive, "shortcut", {
    tag: `${owner}-shortcut`,
    context: (el) => ({
      shortcut:
        el.closest(`${owner}-trigger`)?.getAttribute("shortcut") ?? undefined,
    }),
  })
  definePart(primitive, "backdrop", `${owner}-backdrop`)
  definePart(primitive, "content", {
    tag: `${owner}-content`,
    kinds: popupKinds,
  })
  definePart(primitive, "title", {
    tag: `${owner}-title`,
    display: "block",
    render: renderPopupTitle,
  })
  definePart(primitive, "description", {
    tag: `${owner}-description`,
    display: "block",
    // A paragraph, like the p other frameworks render.
    render(el) {
      if (!el.hasAttribute("as-child") && !el.hasAttribute("role")) {
        el.setAttribute("role", "paragraph")
      }
    },
  })
}

// <ui-dialog> and its parts. Markup:
//
// <ui-dialog>
//   <ui-dialog-trigger><button>Edit profile</button></ui-dialog-trigger>
//   <ui-dialog-backdrop></ui-dialog-backdrop>
//   <ui-dialog-content>
//     <ui-dialog-title>Profile settings</ui-dialog-title>
//     <ui-dialog-description>Make changes to your profile.</ui-dialog-description>
//     <ui-dialog-close><button>Close</button></ui-dialog-close>
//   </ui-dialog-content>
// </ui-dialog>
function defineDialogElements() {
  createParts(dialog, {
    root: {
      tag: "ui-dialog",
      kinds: popupKinds,
      defaults: {
        modal: true,
        dismissible: true,
        closeOnOutsidePress: closesOnOutsidePress,
      },
      // Selectors of elements that stay usable while it's modal, as a property too.
      properties: ["persistentElements"],
      options: ownerOptions,
      state: popupState,
      api: popupApi,
      portal: sheetPortal("ui-dialog-viewport", portalSlots),
    },
  })
  defineDialogParts(dialog, "ui-dialog")
}

// <ui-alert-dialog> and its parts, named like the dialog's:
// <ui-alert-dialog-trigger>, <ui-alert-dialog-content>, <ui-alert-dialog-close value="confirm">.
function defineAlertDialogElements() {
  createParts(alertDialog, {
    root: {
      tag: "ui-alert-dialog",
      kinds: popupKinds,
      defaults: { dismissible: true },
      properties: ["persistentElements"],
      options: ownerOptions,
      state: popupState,
      api: popupApi,
      portal: { ...popupPortal, slots: portalSlots },
    },
  })
  defineDialogParts(alertDialog, "ui-alert-dialog")
}

export { defineAlertDialogElements, defineDialogElements }
