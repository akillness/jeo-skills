import { progress } from "@ui-sdk/core/progress"
import { defineComponent } from "vue"
import { slotContent } from "./children"
import { createParts, withElement } from "./create-parts"
import { usePart, type PartSlots } from "./use-primitive"

const parts = createParts(progress, {
  root: "div",
  track: "div",
  indicator: "div",
  label: "span",
})

/**
 * The root, which is the progressbar.
 * @stable
 */
const Progress = parts.Root

/**
 * The rail the indicator fills.
 * @stable
 */
const ProgressTrack = parts.Track

/**
 * The filled part of the track, as wide as the value.
 * @stable
 */
const ProgressIndicator = parts.Indicator

/**
 * Names the progress bar.
 * @stable
 */
const ProgressLabel = parts.Label

/**
 * The formatted value, like "40%". Content replaces it.
 * @stable
 */
const ProgressValue = withElement(
  "span",
  defineComponent({
    name: "ProgressValue",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof progress, "value">,
    setup(_, { slots }) {
      return usePart(progress, "value", undefined, undefined, {
        tag: "span",
        children: (state) =>
          slotContent(slots.default, { state }) ?? state.text,
      })
    },
  })
)

export type {
  GaugeLabelDetails,
  NumberFormat,
  ProgressOptions,
  ProgressPrimitive,
  ProgressState,
  ProgressStatus,
  ProgressValueState,
} from "@ui-sdk/core/progress"

export {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
}
