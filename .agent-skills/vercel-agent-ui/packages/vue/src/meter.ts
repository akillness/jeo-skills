import { meter } from "@ui-sdk/core/meter"
import { defineComponent } from "vue"
import { slotContent } from "./children"
import { createParts, withElement } from "./create-parts"
import { usePart, type PartSlots } from "./use-primitive"

const parts = createParts(meter, {
  root: "div",
  track: "div",
  indicator: "div",
  label: "span",
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
 * The formatted value, like "40%". Content replaces it.
 * @stable
 */
const MeterValue = withElement(
  "span",
  defineComponent({
    name: "MeterValue",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof meter, "value">,
    setup(_, { slots }) {
      return usePart(meter, "value", undefined, undefined, {
        tag: "span",
        children: (state) =>
          slotContent(slots.default, { state }) ?? state.text,
      })
    },
  })
)

export type {
  MeterLabelDetails,
  MeterOptions,
  MeterPrimitive,
  MeterState,
  MeterValueState,
  NumberFormat,
} from "@ui-sdk/core/meter"

export { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue }
