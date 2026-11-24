import { label } from "@ui-sdk/core/label"
import { createParts } from "./define-element"

// <ui-label for="plan">Plan</ui-label> names the control `for` points at, or
// the one inside it.
function defineLabelElements() {
  createParts(label, {
    root: { tag: "ui-label" },
  })
}

export { defineLabelElements }
