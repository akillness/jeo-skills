import { meter, type MeterValueState } from "@ui-sdk/core/meter"
import type { ComponentProps } from "solid-js"
import { createParts } from "./use-primitive"

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

/**
 * The formatted value, like "40%". Children replace it.
 * @stable
 */
function MeterValue(props: ComponentProps<typeof parts.Value>) {
  return (
    <parts.Value {...props}>
      {props.children ?? ((state: MeterValueState) => state.text)}
    </parts.Value>
  )
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
