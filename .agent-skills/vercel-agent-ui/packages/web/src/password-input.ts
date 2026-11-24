import {
  passwordInput,
  type PasswordInputController,
} from "@ui-sdk/core/password-input"
import { createParts, wrappedButton } from "./define-element"

const owner = "ui-password-input"

// <ui-password-input> holds your own <input> and a toggle that wraps your own
// <button>. The input's type follows whether the password is shown, and it
// keeps its id and `autocomplete`. Markup:
//
// <ui-password-input name="password" required>
//   <input aria-label="Password" autocomplete="new-password" />
//   <ui-password-input-toggle><button aria-label="Show password">…</button></ui-password-input-toggle>
// </ui-password-input>
function definePasswordInputElements() {
  createParts(passwordInput, {
    root: {
      tag: owner,
      display: "block",
      options: (el) => {
        const input = el.querySelector("input")
        // The field is yours, so default-value becomes its `value` attribute,
        // which the field starts with and a form reset returns to.
        const defaultValue = el.getAttribute("default-value")
        if (input && defaultValue !== null && !input.hasAttribute("value")) {
          input.defaultValue = defaultValue
        }
        return {
          controlId: input?.id || undefined,
          autoComplete: input?.getAttribute("autocomplete") ?? undefined,
        }
      },
      // The input names them.
      kinds: { controlId: null, autoComplete: null },
      children: { control: (el) => el.querySelector("input") },
      // The options above read these from the input, and follow them.
      childProps: { attributes: ["autocomplete", "id"] },
      state: {
        value: {
          get: (api: PasswordInputController) => api.getValue(),
          set: (api: PasswordInputController, value: string | null) =>
            api.setValue(value ?? ""),
        },
        visible: {
          get: (api: PasswordInputController) => api.isVisible(),
          set: (api: PasswordInputController, visible: boolean) =>
            api.setVisible(!!visible),
        },
      },
      api: [
        "getValue",
        "setValue",
        "clear",
        "isVisible",
        "setVisible",
        "toggleVisible",
        "focus",
      ],
    },
    toggle: {
      tag: "ui-password-input-toggle",
      display: "contents",
      target: wrappedButton,
    },
  })
}

export { definePasswordInputElements }
