import type { PrimitiveInstance } from "@ui-sdk/core"
import { partState } from "@ui-sdk/core/renderer"
import { progress } from "@ui-sdk/core/progress"
import { showDefaultText } from "./default-text"
import { createParts } from "./define-element"

const valueText = (_: HTMLElement, instance: PrimitiveInstance) =>
  (partState(instance.part("value")) as { text: string }).text

// <ui-progress> is the progress bar. Without `value`, it's indeterminate. Markup:
//
// <ui-progress value="40">
//   <ui-progress-label>Uploading</ui-progress-label>
//   <ui-progress-value></ui-progress-value>
//   <ui-progress-track><ui-progress-indicator></ui-progress-indicator></ui-progress-track>
// </ui-progress>
//
// An empty <ui-progress-value> shows the formatted value. Set `format` and
// `getValueLabel` as properties.
function defineProgressElements() {
  createParts(progress, {
    root: {
      tag: "ui-progress",
      display: "block",
      render: (el, instance) =>
        showDefaultText(el, instance, "ui-progress-value", valueText),
    },
    track: { tag: "ui-progress-track", display: "block" },
    indicator: { tag: "ui-progress-indicator", display: "block" },
    label: "ui-progress-label",
    value: "ui-progress-value",
  })
}

export { defineProgressElements }
