import { toolbar } from "@ui-sdk/core/toolbar"
import { createParts } from "./define-element"

// The control a toolbar item wraps: its own button, link or field, or the one
// inside a component it wraps, like the button of a <ui-menu-trigger>.
const wrappedControl = (el: HTMLElement) =>
  el.querySelector<HTMLElement>("button, a[href], input, textarea") ??
  (el.firstElementChild as HTMLElement | null)

// <ui-toolbar> and its parts. Toggles and toggle groups inside join it. Items
// wrap your own button, link or field, or a component's trigger. Markup:
//
// <ui-toolbar aria-label="Formatting">
//   <ui-toggle-group multiple aria-label="Text style">
//     <ui-toggle value="bold"><button>Bold</button></ui-toggle>
//   </ui-toggle-group>
//   <ui-toolbar-separator></ui-toolbar-separator>
//   <ui-menu>
//     <ui-toolbar-button><ui-menu-trigger><button>Font</button></ui-menu-trigger></ui-toolbar-button>
//     <ui-menu-content>…</ui-menu-content>
//   </ui-menu>
//   <ui-toolbar-input><input aria-label="Comment" /></ui-toolbar-input>
//   <ui-toolbar-group aria-label="History">
//     <ui-toolbar-button><button>Undo</button></ui-toolbar-button>
//   </ui-toolbar-group>
//   <ui-toolbar-link><a href="/help">Help</a></ui-toolbar-link>
// </ui-toolbar>
function defineToolbarElements() {
  createParts(toolbar, {
    root: {
      tag: "ui-toolbar",
      display: "block",
      defaults: { loop: true },
      api: ["focus"],
    },
    button: {
      tag: "ui-toolbar-button",
      display: "contents",
      target: wrappedControl,
      defaults: { focusableWhenDisabled: true },
    },
    input: {
      tag: "ui-toolbar-input",
      display: "contents",
      target: wrappedControl,
      defaults: { focusableWhenDisabled: true },
    },
    link: {
      tag: "ui-toolbar-link",
      display: "contents",
      target: wrappedControl,
    },
    group: { tag: "ui-toolbar-group", display: "block" },
    separator: { tag: "ui-toolbar-separator", display: "block" },
  })
}

export { defineToolbarElements }
