import {
  input,
  inputGroup,
  textarea,
  type InputController,
} from "@ui-sdk/core/input"
import { createParts, wrappedChild } from "./define-element"

const textApi: ("getValue" | "setValue" | "clear" | "focus")[] = [
  "getValue",
  "setValue",
  "clear",
  "focus",
]
// `value` reads and writes the field like the controller, so a write fires `valuechange`.
const textState = {
  value: {
    get: (api: InputController) => api.getValue(),
    set: (api: InputController, value: string | null) =>
      api.setValue(value ?? ""),
  },
}

// The native field's own state, which its data attributes follow.
const controlProps = {
  attributes: ["disabled", "readonly", "required"],
  read: (el: HTMLElement) => {
    const field = el as HTMLInputElement | HTMLTextAreaElement
    return {
      disabled: field.disabled,
      readOnly: field.readOnly,
      required: field.required,
    }
  },
}

// <ui-input> and <ui-textarea> wrap a native field. They mark it
// `data-filled` and fire `valuechange` with a reason. Put them in a
// <ui-field> to wire the field to its label and messages. Markup:
//
// <ui-input><input name="email" type="email" /></ui-input>
// <ui-textarea auto-resize><textarea name="bio"></textarea></ui-textarea>
function defineInputElements() {
  createParts(input, {
    root: {
      tag: "ui-input",
      display: "contents",
      children: { root: (el) => el.querySelector(":scope > input") },
      childProps: controlProps,
      state: textState,
      api: textApi,
    },
  })
  createParts(textarea, {
    root: {
      tag: "ui-textarea",
      display: "contents",
      children: { root: (el) => el.querySelector(":scope > textarea") },
      childProps: controlProps,
      // The submit shortcut submits the form the textarea is in, so a form's own
      // submit event hears it. A bubbling "submit" event would reach the form too.
      silent: ["onSubmit"],
      state: textState,
      api: textApi,
    },
  })
}

// <ui-input-group> holds a field with icons, text and buttons around it.
// Presses on its text and icons focus the field. <ui-input-clear> wraps a
// button that empties the field, shown while there's text to clear. Markup:
//
// <ui-input-group>
//   <svg>…</svg>
//   <input type="search" aria-label="Search" />
//   <ui-input-clear><button aria-label="Clear">×</button></ui-input-clear>
// </ui-input-group>
function defineInputGroupElements() {
  createParts(inputGroup, {
    root: { tag: "ui-input-group", self: "group", display: "block" },
    clear: {
      tag: "ui-input-clear",
      display: "contents",
      target: wrappedChild("button"),
    },
  })
}

export { defineInputElements, defineInputGroupElements }
