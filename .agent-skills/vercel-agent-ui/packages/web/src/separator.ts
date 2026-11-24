import { separator } from "@ui-sdk/core/separator"
import { createParts } from "./define-element"

// <ui-separator> is the line itself. Markup:
//
// <ui-separator></ui-separator>
// <ui-separator orientation="vertical"></ui-separator>
// <ui-separator decorative></ui-separator>
function defineSeparatorElements() {
  createParts(separator, {
    root: { tag: "ui-separator", display: "block" },
  })
}

export { defineSeparatorElements }
