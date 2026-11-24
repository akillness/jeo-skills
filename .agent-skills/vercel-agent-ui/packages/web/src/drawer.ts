import { drawer, type SnapPoint } from "@ui-sdk/core/drawer"
import { actionOf } from "./action"
import { createParts, wrappedButton } from "./define-element"
import {
  closesOnOutsidePress,
  popupApi,
  popupKinds,
  popupPortal,
  popupState,
  renderPopupTitle,
} from "./popup"

// container="#id" renders the backdrop and the drawer's viewport there.
const portal = { ...popupPortal, slots: ["backdrop", "viewport"] }

// <ui-drawer> and its parts. Markup:
//
// <ui-drawer snap-points="0.5,1">
//   <ui-drawer-trigger><button>Move goal</button></ui-drawer-trigger>
//   <ui-drawer-backdrop></ui-drawer-backdrop>
//   <ui-drawer-content>
//     <ui-drawer-handle><button aria-label="Resize"></button></ui-drawer-handle>
//     <ui-drawer-title>Move goal</ui-drawer-title>
//     <ui-drawer-description>Set your daily activity goal.</ui-drawer-description>
//     <ui-drawer-close><button>Cancel</button></ui-drawer-close>
//   </ui-drawer-content>
// </ui-drawer>
//
// The content sits in a full-screen <ui-drawer-viewport>, which it adds
// around itself when the markup has none.
function defineDrawerElements() {
  createParts(drawer, {
    root: {
      tag: "ui-drawer",
      kinds: popupKinds,
      defaults: {
        modal: true,
        dismissible: true,
        closeOnOutsidePress: closesOnOutsidePress,
        expandOnScroll: true,
      },
      properties: ["persistentElements"],
      // `portal` handles the `container` attribute, so core never gets it.
      options: () => ({ container: undefined }),
      state: {
        ...popupState,
        snapPoint: {
          get: (api: { getSnapPoint: () => SnapPoint | null }) =>
            api.getSnapPoint(),
          set: (
            api: { setSnapPoint: (point: SnapPoint) => void },
            point: SnapPoint
          ) => api.setSnapPoint(point),
        },
      },
      api: [...popupApi, "getSnapPoint", "setSnapPoint"],
      portal,
    },
    // With `for="drawer-id"`, it opens that drawer from anywhere on the page.
    trigger: {
      tag: "ui-drawer-trigger",
      display: "contents",
      target: wrappedButton,
    },
    close: {
      tag: "ui-drawer-close",
      display: "contents",
      target: wrappedButton,
      context: (el) =>
        el.hasAttribute("action") ? { action: actionOf(el) } : {},
    },
    shortcut: {
      tag: "ui-drawer-shortcut",
      context: (el) => ({
        shortcut:
          el.closest("ui-drawer-trigger")?.getAttribute("shortcut") ??
          undefined,
      }),
    },
    backdrop: "ui-drawer-backdrop",
    viewport: "ui-drawer-viewport",
    content: {
      tag: "ui-drawer-content",
      kinds: popupKinds,
      render(el) {
        if (el.parentElement?.localName === "ui-drawer-viewport") {
          return
        }
        const viewport = el.ownerDocument.createElement("ui-drawer-viewport")
        el.before(viewport)
        viewport.append(el)
      },
    },
    // The grabber wraps a button, like a trigger. Name the button, like aria-label="Resize".
    handle: {
      tag: "ui-drawer-handle",
      display: "contents",
      target: wrappedButton,
    },
    // With `for="drawer-id"`, an element anywhere, like the page's shell, follows the drawer.
    outlet: { tag: "ui-drawer-outlet", display: "block" },
    title: {
      tag: "ui-drawer-title",
      display: "block",
      render: renderPopupTitle,
    },
    description: {
      tag: "ui-drawer-description",
      display: "block",
      render(el) {
        if (!el.hasAttribute("as-child") && !el.hasAttribute("role")) {
          el.setAttribute("role", "paragraph")
        }
      },
    },
  })
}

export { defineDrawerElements }
