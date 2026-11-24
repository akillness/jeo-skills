import type { PrimitiveInstance } from "@ui-sdk/core"
import { partState } from "@ui-sdk/core/renderer"
import { meter } from "@ui-sdk/core/meter"
import { showDefaultText } from "./default-text"
import { createParts } from "./define-element"

const valueText = (_: HTMLElement, instance: PrimitiveInstance) =>
  (partState(instance.part("value")) as { text: string }).text

// <ui-meter> is the meter. Without `value`, it reads as `min`. Markup:
//
// <ui-meter value="40">
//   <ui-meter-label>Storage</ui-meter-label>
//   <ui-meter-value></ui-meter-value>
//   <ui-meter-track><ui-meter-indicator></ui-meter-indicator></ui-meter-track>
// </ui-meter>
//
// An empty <ui-meter-value> shows the formatted value. Set `format` and
// `getValueLabel` as properties.
function defineMeterElements() {
  createParts(meter, {
    root: {
      tag: "ui-meter",
      display: "block",
      render: (el, instance) =>
        showDefaultText(el, instance, "ui-meter-value", valueText),
    },
    track: { tag: "ui-meter-track", display: "block" },
    indicator: { tag: "ui-meter-indicator", display: "block" },
    label: "ui-meter-label",
    value: "ui-meter-value",
  })
}

export { defineMeterElements }
