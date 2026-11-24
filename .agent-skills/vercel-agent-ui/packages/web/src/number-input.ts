import { numberInput, type NumberInputApi } from "@ui-sdk/core/number-input"
import { createParts } from "./define-element"

const owner = "ui-number-input"

// Whether the author wrote `disabled` on a step button's own <button>, by
// button. It's read before the core writes its own at a bound, so the core
// never removes it as one it wrote.
const authoredDisabled = new WeakMap<HTMLElement, boolean>()

function stepButtonProps(el: HTMLElement) {
  const inner = el.querySelector("button")
  if (!inner) {
    return {}
  }
  if (!authoredDisabled.has(inner)) {
    authoredDisabled.set(inner, inner.hasAttribute("disabled"))
  }
  return authoredDisabled.get(inner) ? { disabled: true } : {}
}

// <ui-number-input> is form-associated: it submits the number as is, like
// "1234.5", under its name. The input and buttons are your own elements:
//
// <ui-number-input name="quantity" default-value="1" min="1">
//   <ui-number-input-decrement><button aria-label="Decrease">−</button></ui-number-input-decrement>
//   <ui-number-input-control><input aria-label="Quantity" /></ui-number-input-control>
//   <ui-number-input-increment><button aria-label="Increase">+</button></ui-number-input-increment>
// </ui-number-input>
//
// Set `format` as a property, like `{ style: "currency", currency: "USD" }`.
function defineNumberInputElements() {
  createParts(numberInput, {
    root: {
      tag: owner,
      display: "block",
      formAssociated: true,
      // The framework adapters pass it, never an attribute or a property.
      kinds: { controlId: null },
      // A disabled <ui-field> around it disables it, as a disabled Field does
      // in the other frameworks.
      options: (el) => ({
        ...(el.closest("ui-field")?.hasAttribute("disabled") && {
          disabled: true,
        }),
      }),
      state: {
        value: {
          get: (api: NumberInputApi) => api.getValue(),
          set: (api: NumberInputApi, value: number | null) =>
            api.setValue(value),
        },
      },
      api: ["getValue", "setValue", "increment", "decrement", "focus"],
      // The scrub cursor is fixed to the viewport, so it moves to the body while
      // shown, where transformed ancestors can't offset it.
      portal: { slots: ["scrub-area-cursor"], container: () => document.body },
    },
    group: { tag: "ui-number-input-group", display: "block" },
    // These wrap your own <input> and <button>s, so they keep their native
    // behavior. `disabled` on a step button's element or on its <button> disables it.
    control: {
      tag: "ui-number-input-control",
      display: "contents",
      target: (el) => el.querySelector("input"),
    },
    increment: {
      tag: "ui-number-input-increment",
      display: "contents",
      target: (el) => el.querySelector("button"),
      context: stepButtonProps,
    },
    decrement: {
      tag: "ui-number-input-decrement",
      display: "contents",
      target: (el) => el.querySelector("button"),
      context: stepButtonProps,
    },
    // Any number of scrub areas, anywhere inside, or anywhere on the page with
    // `for="<number input id>"`, like an icon in a toolbar.
    "scrub-area": "ui-number-input-scrub-area",
    "scrub-area-cursor": {
      tag: "ui-number-input-scrub-area-cursor",
      display: "block",
    },
  })
}

export { defineNumberInputElements }
