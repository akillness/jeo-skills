import { progress, type ProgressValueState } from "@ui-sdk/core/progress"
import { createParts, type PartProps } from "./use-primitive"

const parts = createParts(progress, {
  root: "div",
  track: "div",
  indicator: "div",
  label: "span",
  value: "span",
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

const text = (state: ProgressValueState) => state.text

/**
 * The formatted value, like "40%". Children replace it.
 * @stable
 */
function ProgressValue({
  children = text,
  ...props
}: PartProps<"span", ProgressValueState>) {
  return <parts.Value {...props}>{children}</parts.Value>
}

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
