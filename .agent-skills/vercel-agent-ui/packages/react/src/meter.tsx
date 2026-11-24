import { meter, type MeterValueState } from "@ui-sdk/core/meter"
import { createParts, type PartProps } from "./use-primitive"

const parts = createParts(meter, {
  root: "div",
  track: "div",
  indicator: "div",
  label: "span",
  value: "span",
})

/**
 * The root, which is the meter.
 * @stable
 */
const Meter = parts.Root

/**
 * The rail the indicator fills.
 * @stable
 */
const MeterTrack = parts.Track

/**
 * The filled part of the track, as wide as the value.
 * @stable
 */
const MeterIndicator = parts.Indicator

/**
 * Names the meter.
 * @stable
 */
const MeterLabel = parts.Label

const text = (state: MeterValueState) => state.text

/**
 * The formatted value, like "40%". Children replace it.
 * @stable
 */
function MeterValue({
  children = text,
  ...props
}: PartProps<"span", MeterValueState>) {
  return <parts.Value {...props}>{children}</parts.Value>
}

export type {
  MeterLabelDetails,
  MeterOptions,
  MeterPrimitive,
  MeterState,
  MeterValueState,
  NumberFormat,
} from "@ui-sdk/core/meter"

export { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue }
