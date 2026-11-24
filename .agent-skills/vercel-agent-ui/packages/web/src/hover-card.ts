import { hoverCard } from "@ui-sdk/core/hover-card"
import { createParts } from "./define-element"
import { popupApi, popupKinds, popupPortal, popupState } from "./popup"

const owner = "ui-hover-card"

// <ui-hover-card> and its parts. Markup:
//
// <ui-hover-card>
//   <ui-hover-card-trigger><a href="/ada">@ada</a></ui-hover-card-trigger>
//   <ui-hover-card-content>
//     <ui-hover-card-arrow></ui-hover-card-arrow>
//     …
//   </ui-hover-card-content>
// </ui-hover-card>
function defineHoverCardElements() {
  createParts(hoverCard, {
    root: {
      tag: owner,
      kinds: popupKinds,
      // `portal` handles the `container` attribute, so core never gets it.
      options: () => ({ container: undefined }),
      state: popupState,
      api: popupApi,
      // container="#id" renders the popup there.
      portal: popupPortal,
    },
    // The trigger wraps the user's own link, so it stays one.
    // With `for="card-id"`, it opens that card from anywhere on the page.
    trigger: {
      tag: "ui-hover-card-trigger",
      display: "contents",
      target: (el) =>
        el.querySelector<HTMLElement>("a[href], button") ??
        (el.firstElementChild as HTMLElement),
    },
    content: { tag: "ui-hover-card-content", kinds: popupKinds },
    arrow: { tag: "ui-hover-card-arrow", display: "block" },
  })
}

export { defineHoverCardElements }
