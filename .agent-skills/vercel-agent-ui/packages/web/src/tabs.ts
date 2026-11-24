import { tabs } from "@ui-sdk/core/tabs"
import { createParts, wrappedButton } from "./define-element"

// <ui-tabs> and its parts. Markup:
//
// <ui-tabs value="account">
//   <ui-tabs-list aria-label="Settings">
//     <ui-tabs-tab value="account"><button>Account</button></ui-tabs-tab>
//     <ui-tabs-tab value="password"><button>Password</button></ui-tabs-tab>
//     <ui-tabs-indicator></ui-tabs-indicator>
//   </ui-tabs-list>
//   <ui-tabs-panel value="account">…</ui-tabs-panel>
//   <ui-tabs-panel value="password">…</ui-tabs-panel>
// </ui-tabs>
function defineTabsElements() {
  createParts(tabs, {
    root: {
      tag: "ui-tabs",
      display: "block",
      defaults: { loop: true },
      // `value` is live: setting the property or the attribute selects a tab,
      // like a controller, and fires `valuechange`.
      state: {
        value: {
          get: (api) => api.getValue(),
          set: (api, value) => api.setValue(value),
        },
      },
      api: ["getValue", "setValue", "select", "focus"],
    },
    list: { tag: "ui-tabs-list", display: "block" },
    // A wrapper, so the tab stays a real button with its built-in behavior. It
    // has no role, so the tab list still sees its tabs as direct children.
    tab: {
      tag: "ui-tabs-tab",
      display: "contents",
      target: wrappedButton,
      render: (el) => el.setAttribute("role", "none"),
    },
    // An icon inside a tab's button. Screen readers skip it.
    "tab-icon": "ui-tabs-tab-icon",
    indicator: { tag: "ui-tabs-indicator", display: "block" },
    panel: { tag: "ui-tabs-panel", display: "block" },
  })
}

export { defineTabsElements }
