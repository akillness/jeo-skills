import { dateInput, type DateInputOptions } from "@ui-sdk/core/date-input"
import { useFieldControl } from "./field-context"
import {
  useSegmentedRoot,
  useSegment,
  type RootProps,
  type SegmentProps,
} from "./segmented-input"
import { usePrimitive } from "./use-primitive"

/**
 * The root: a group of segments the locale orders, like month, day and year,
 * and the hidden input the ISO value submits with. Without children it renders
 * every segment; its children can be a function of its state that renders
 * `state.segments`.
 * @stable
 */
function DateInput({
  value,
  defaultValue,
  onValueChange,
  granularity,
  hourCycle,
  min,
  max,
  unavailable,
  locale,
  disabled,
  readOnly,
  required,
  name,
  form,
  controller,
  debug,
  ...props
}: DateInputOptions & RootProps) {
  const field = useFieldControl()
  const instance = usePrimitive(dateInput, {
    value,
    defaultValue,
    onValueChange,
    granularity,
    hourCycle,
    min,
    max,
    unavailable,
    locale,
    disabled: disabled || field?.disabled,
    readOnly,
    required,
    name: name ?? field?.name,
    form,
    controller,
    debug,
  })
  return useSegmentedRoot(dateInput, instance, field, props, DateInputSegment)
}

/**
 * A segment, like the month: an input arrow keys step and digits fill, named
 * by its unit. The text between segments renders as a span.
 * @stable
 */
function DateInputSegment(props: SegmentProps) {
  return useSegment(dateInput, props)
}

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
