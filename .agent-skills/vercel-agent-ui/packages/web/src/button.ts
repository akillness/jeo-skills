import { button } from "@ui-sdk/core/button"
import { actionOf } from "./action"
import { createParts, wrappedButton } from "./define-element"

// What the author wrote as the inner button's type, by inner button, read
// before the core writes its own, so <button type="submit"> stays a submit
// button. A type that differs from the one the core wrote is the author's new one.
const authoredTypes = new WeakMap<HTMLElement, string | null>()

const isButtonType = (
  type: string | null | undefined
): type is "button" | "submit" | "reset" =>
  type === "button" || type === "submit" || type === "reset"

function authoredType(el: HTMLElement) {
  const inner = wrappedButton(el)
  if (!inner) {
    return undefined
  }
  const current = inner.getAttribute("type")
  const authored = authoredTypes.get(inner)
  // Anything else, like no type at all, gets the core's default, "button".
  const written = isButtonType(authored) ? authored : "button"
  if (!authoredTypes.has(inner) || current !== written) {
    authoredTypes.set(inner, current)
  }
  const type = authoredTypes.get(inner)
  return isButtonType(type) ? type : undefined
}

// <ui-button> wraps your own <button> or <a>, so native behavior stays: a
// submit button submits its form, and a link stays a link. Pressing it fires
// an `action` event on the element, whose `detail.source` says how it was
// pressed. Pass a Promise to `event.detail.waitUntil()` to keep the button
// pending until it settles. Markup:
//
// <ui-button><button type="submit">Save</button></ui-button>
// <ui-button disabled focusable-when-disabled><button>Archive</button></ui-button>
// <ui-button><a href="/docs">Docs</a></ui-button>
function defineButtonElements() {
  createParts(button, {
    root: {
      tag: "ui-button",
      target: wrappedButton,
      display: "contents",
      // The button's own type, as written, so <button type="submit"> stays a submit button.
      kinds: { type: null },
      options: (el) => ({ type: authoredType(el), action: actionOf(el) }),
    },
  })
}

export { defineButtonElements }
