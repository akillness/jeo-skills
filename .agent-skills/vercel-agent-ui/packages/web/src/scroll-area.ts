import { scrollArea } from "@ui-sdk/core/scroll-area"
import { createParts, wrappedButton } from "./define-element"

const owner = "ui-scroll-area"

// The scrollbar a thumb sits in names it, so a thumb's key is its axis.
const thumbAxis = (el: HTMLElement) => {
  const orientation =
    el.closest("ui-scroll-area-scrollbar")?.getAttribute("orientation") ??
    "vertical"
  return { id: orientation, orientation }
}

// <ui-scroll-area> and its parts. Markup:
//
// <ui-scroll-area stick-to-end type="hover">
//   <ui-scroll-area-viewport>
//     <ui-scroll-area-content>…</ui-scroll-area-content>
//   </ui-scroll-area-viewport>
//   <ui-scroll-area-scrollbar orientation="vertical">
//     <ui-scroll-area-thumb></ui-scroll-area-thumb>
//   </ui-scroll-area-scrollbar>
//   <ui-scroll-area-scroll-to-end><button>Jump to latest</button></ui-scroll-area-scroll-to-end>
// </ui-scroll-area>
//
// The controller's methods are on `api`, like `el.api.scrollToEnd()`.
function defineScrollAreaElements() {
  createParts(scrollArea, {
    root: {
      tag: owner,
      display: "block",
      api: [
        "scrollToEnd",
        "scrollToStart",
        "isAtEnd",
        "isAtStart",
        "isSticking",
      ],
    },
    viewport: { tag: "ui-scroll-area-viewport", display: "block" },
    content: { tag: "ui-scroll-area-content", display: "block" },
    scrollbar: {
      tag: "ui-scroll-area-scrollbar",
      display: "block",
      context: (el) => ({ id: el.getAttribute("orientation") ?? "vertical" }),
    },
    thumb: {
      tag: "ui-scroll-area-thumb",
      display: "block",
      context: thumbAxis,
    },
    corner: { tag: "ui-scroll-area-corner", display: "block" },
    // A wrapper, so the button stays a real button with its built-in behavior.
    "scroll-to-end": {
      tag: "ui-scroll-area-scroll-to-end",
      display: "contents",
      target: wrappedButton,
    },
  })
}

export { defineScrollAreaElements }
