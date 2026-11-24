import { dateInput, type DateMatchers } from "@ui-sdk/core/date-input"
import { defineComponent, type PropType } from "vue"
import { withElement } from "./create-parts"
import {
  defineSegment,
  rootEmits,
  rootProps,
  setupRoot,
} from "./segmented-input"
import type { PartSlots } from "./use-primitive"

/**
 * A segment, like the month: an input arrow keys step and digits fill, named
 * by its unit. The text between segments renders as a span.
 * @stable
 */
const DateInputSegment = defineSegment(dateInput, "DateInputSegment")

/**
 * The root: a group of segments the locale orders, like month, day and year,
 * and the hidden input the ISO value submits with. Without content it renders
 * every segment; its default slot gets `state`, whose `segments` it can render.
 * @stable
 */
const DateInput = withElement(
  "div",
  defineComponent({
    name: "DateInput",
    inheritAttrs: false,
    props: {
      ...rootProps,
      unavailable: null as unknown as PropType<DateMatchers>,
    },
    emits: rootEmits,
    slots: Object as PartSlots<typeof dateInput, "root">,
    setup: (props, context) =>
      setupRoot(dateInput, DateInputSegment, props, context),
  })
)

export { createDateInputController } from "@ui-sdk/core/date-input"
export type {
  DateInputApi,
  DateInputChangeOptions,
  DateInputController,
  DateInputGranularity,
  DateInputOptions,
  DateInputPrimitive,
  DateInputSegmentData,
  DateInputSegmentProps,
  DateInputSegmentState,
  DateInputSegmentType,
  DateInputState,
  DateInputValueChangeReason,
  DateMatcher,
  DateMatchers,
  HourCycle,
} from "@ui-sdk/core/date-input"

export { DateInput, DateInputSegment }
