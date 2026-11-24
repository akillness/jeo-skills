import { tooltip } from "@ui-sdk/core/tooltip"
import { createParts } from "./define-element"
import { popupApi, popupKinds, popupPortal, popupState } from "./popup"

const owner = "ui-tooltip"

// <ui-tooltip> and its parts. Markup:
//
// <ui-tooltip shortcut="mod+s">
//   <ui-tooltip-trigger><button aria-label="Save">…</button></ui-tooltip-trigger>
//   <ui-tooltip-content>
//     Save <ui-tooltip-shortcut></ui-tooltip-shortcut>
//     <ui-tooltip-arrow></ui-tooltip-arrow>
//   </ui-tooltip-content>
// </ui-tooltip>
function defineTooltipElements() {
  createParts(tooltip, {
    root: {
      tag: owner,
      defaults: { closeOnPress: true },
      kinds: popupKinds,
      // `portal` handles the `container` attribute, so core never gets it.
      options: () => ({ container: undefined }),
      state: popupState,
      api: popupApi,
      // container="#id" renders the popup there.
      portal: popupPortal,
    },
    // The trigger wraps the user's own button or link, so it stays one. Inside
    // another component's trigger, like <ui-menu-trigger>, it's the button deepest in.
    // With `for="tooltip-id"`, it shows that tooltip from anywhere on the page.
    trigger: {
      tag: "ui-tooltip-trigger",
      display: "contents",
      target: (el) =>
        el.querySelector<HTMLElement>("button, a[href]") ??
        (el.firstElementChild as HTMLElement),
    },
    content: { tag: "ui-tooltip-content", kinds: popupKinds },
    arrow: { tag: "ui-tooltip-arrow", display: "block" },
    // Shows the tooltip's shortcut, or its own `shortcut`, when it has no text of its own.
    shortcut: "ui-tooltip-shortcut",
  })
}

export { defineTooltipElements }
