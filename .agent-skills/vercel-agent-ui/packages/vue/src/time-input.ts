import { timeInput, type TimeInputGranularity } from "@ui-sdk/core/time-input"
import { defineComponent, type PropType } from "vue"
import { withElement } from "./create-parts"
import {
  defineSegment,
  rootEmits,
  rootProps,
  setupRoot,
  type Segmented,
} from "./segmented-input"
import type { PartSlots } from "./use-primitive"

// Time Input has Date Input's slots and state.
const primitive = timeInput as unknown as Segmented

/**
 * A segment, like the hour: an input arrow keys step and digits fill, named
 * by its unit. The text between segments renders as a span.
 * @stable
 */
const TimeInputSegment = defineSegment(primitive, "TimeInputSegment")

/**
 * The root: a group of segments, hours and minutes, with seconds and AM/PM
 * when shown, and the hidden input the time submits with. Without content it
 * renders every segment; its default slot gets `state`, whose `segments` it can render.
 * @stable
 */
const TimeInput = withElement(
  "div",
  defineComponent({
    name: "TimeInput",
    inheritAttrs: false,
    props: {
      ...rootProps,
      granularity: String as PropType<TimeInputGranularity>,
    },
    emits: rootEmits,
    slots: Object as PartSlots<Segmented, "root">,
    setup: (props, context) =>
      setupRoot(primitive, TimeInputSegment, props, context),
  })
)

export { createTimeInputController } from "@ui-sdk/core/time-input"
export type {
  HourCycle,
  TimeInputApi,
  TimeInputChangeOptions,
  TimeInputController,
  TimeInputGranularity,
  TimeInputOptions,
  TimeInputPrimitive,
  TimeInputSegmentData,
  TimeInputSegmentProps,
  TimeInputSegmentState,
  TimeInputSegmentType,
  TimeInputState,
  TimeInputValueChangeReason,
} from "@ui-sdk/core/time-input"

export { TimeInput, TimeInputSegment }
