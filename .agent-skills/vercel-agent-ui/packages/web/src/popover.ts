import { popover } from "@ui-sdk/core/popover"
import { createParts, wrappedButton } from "./define-element"
import {
  popupApi,
  popupKinds,
  popupState,
  renderPopupTitle,
  sheetPortal,
} from "./popup"

const owner = "ui-popover"

// <ui-popover> and its parts. Markup:
//
// <ui-popover>
//   <ui-popover-trigger shortcut="mod+i">
//     <button>Profile <ui-popover-shortcut></ui-popover-shortcut></button>
//   </ui-popover-trigger>
//   <ui-popover-content>
//     <ui-popover-arrow></ui-popover-arrow>
//     <ui-popover-title>Edit profile</ui-popover-title>
//     <ui-popover-description>Your name appears on your posts.</ui-popover-description>
//     <ui-popover-close><button>Close</button></ui-popover-close>
//   </ui-popover-content>
// </ui-popover>
function definePopoverElements() {
  createParts(popover, {
    root: {
      tag: owner,
      defaults: { dismissible: true },
      kinds: popupKinds,
      // `portal` handles the `container` attribute, so core never gets it.
      options: () => ({ container: undefined }),
      state: popupState,
      api: popupApi,
      // container="#id" renders the popup there, and a sheet's viewport with it.
      portal: sheetPortal("ui-popover-viewport"),
    },
    // With `for="popover-id"`, it opens that popover from anywhere on the page.
    trigger: {
      tag: "ui-popover-trigger",
      display: "contents",
      target: wrappedButton,
    },
    close: {
      tag: "ui-popover-close",
      display: "contents",
      target: wrappedButton,
    },
    // Shows the shortcut of the trigger it's in, or its own `shortcut`, when it has no text of its own.
    shortcut: {
      tag: "ui-popover-shortcut",
      context: (el) => ({
        shortcut:
          el.closest("ui-popover-trigger")?.getAttribute("shortcut") ??
          undefined,
      }),
    },
    content: { tag: "ui-popover-content", kinds: popupKinds },
    title: {
      tag: "ui-popover-title",
      display: "block",
      render: renderPopupTitle,
    },
    description: {
      tag: "ui-popover-description",
      display: "block",
      // A paragraph, like the p other frameworks render.
      render(el) {
        if (!el.hasAttribute("as-child") && !el.hasAttribute("role")) {
          el.setAttribute("role", "paragraph")
        }
      },
    },
    arrow: { tag: "ui-popover-arrow", display: "block" },
  })
}

export { definePopoverElements }
