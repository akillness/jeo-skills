import {
  segmentedControl,
  type SegmentedControlApi,
} from "@ui-sdk/core/segmented-control"
import { createParts } from "./define-element"

// <ui-segmented-control> takes part in forms like native radios that share a
// name, with no hidden inputs.
function defineSegmentedControlElements() {
  createParts(segmentedControl, {
    root: {
      tag: "ui-segmented-control",
      defaults: { loop: true },
      display: "block",
      formAssociated: true,
      state: {
        value: {
          get: (api: SegmentedControlApi) => api.getValue(),
          set: (api: SegmentedControlApi, value: string | null) =>
            api.setValue(value),
        },
      },
      api: ["getValue", "setValue", "focus"],
    },
    // Form-associated, so a <label> around or pointing at an item checks it.
    item: { tag: "ui-segmented-control-item", formAssociated: true },
    indicator: "ui-segmented-control-indicator",
  })
}

export { defineSegmentedControlElements }
