import {
  toggle,
  toggleGroup,
  type ToggleApi,
  type ToggleGroupApi,
} from "@ui-sdk/core/toggle"
import type { ToolbarApi } from "@ui-sdk/core/toolbar"
import { createParts, instanceOf, wrappedButton } from "./define-element"

// The toolbar a toggle or a toggle group sits in, read when needed, since it
// may upgrade later, and whether a toolbar group around it is disabled.
const toolbarOf = (el: HTMLElement) => () =>
  instanceOf<ToolbarApi>(
    el.parentElement?.closest("ui-toolbar")
  )?.api.internal.scopeIn(
    !!el.parentElement?.closest(
      'ui-toolbar-group[disabled]:not([disabled="false"])'
    )
  )

// <ui-toggle> wraps your own <button>. Inside <ui-toggle-group>, the group
// decides whether it's pressed. Markup:
//
// <ui-toggle default-pressed><button aria-label="Bookmark">…</button></ui-toggle>
function defineToggleElements() {
  createParts(toggle, {
    root: {
      tag: "ui-toggle",
      target: wrappedButton,
      display: "contents",
      // Its group and toolbar are the ones around it, never properties.
      kinds: { group: null, toolbar: null },
      options: (el) => ({
        // Read when needed, since the group may upgrade after the toggle.
        group: () =>
          instanceOf<ToggleGroupApi>(
            el.parentElement?.closest("ui-toggle-group")
          )?.api,
        toolbar: toolbarOf(el),
      }),
      state: {
        pressed: {
          get: (api: ToggleApi) => api.isPressed(),
          set: (api: ToggleApi, pressed: boolean) => api.setPressed(!!pressed),
        },
      },
      api: ["isPressed", "setPressed", "toggle", "focus"],
    },
    // An icon inside the toggle's button. Screen readers skip it.
    icon: "ui-toggle-icon",
  })
}

// <ui-toggle-group> holds toggles that share one value, with one tab stop and
// arrow keys between them. `value` and `default-value` take comma-separated
// values. Markup:
//
// <ui-toggle-group multiple default-value="bold" aria-label="Text formatting">
//   <ui-toggle value="bold"><button>Bold</button></ui-toggle>
//   <ui-toggle value="italic"><button>Italic</button></ui-toggle>
// </ui-toggle-group>
function defineToggleGroupElements() {
  createParts(toggleGroup, {
    root: {
      tag: "ui-toggle-group",
      self: "group",
      display: "block",
      defaults: { deselectable: true, loop: true },
      kinds: { toolbar: null },
      options: (el) => ({ toolbar: toolbarOf(el) }),
      state: {
        value: {
          get: (api: ToggleGroupApi) => api.getValue(),
          set: (api: ToggleGroupApi, value: string[]) =>
            api.setValue(value ?? []),
        },
      },
      api: ["getValue", "setValue", "isPressed", "toggle", "focus"],
    },
  })
  // Toggles after the group, so they find it as they upgrade.
  defineToggleElements()
}

export { defineToggleElements, defineToggleGroupElements }
