import { timeInput, type TimeInputOptions } from "@ui-sdk/core/time-input"
import { useFieldControl } from "./field-context"
import {
  useSegmentedRoot,
  useSegment,
  type RootProps,
  type Segmented,
  type SegmentProps,
} from "./segmented-input"
import { usePrimitive } from "./use-primitive"

const primitive = timeInput as unknown as Segmented

/**
 * The root: a group of segments, hours and minutes, with seconds and AM/PM
 * when shown, and the hidden input the time submits with. Without children it
 * renders every segment; its children can be a function of its state that
 * renders `state.segments`.
 * @stable
 */
function TimeInput({
  value,
  defaultValue,
  onValueChange,
  granularity,
  hourCycle,
  min,
  max,
  locale,
  disabled,
  readOnly,
  required,
  name,
  form,
  controller,
  debug,
  ...props
}: TimeInputOptions & RootProps) {
  const field = useFieldControl()
  const instance = usePrimitive(timeInput, {
    value,
    defaultValue,
    onValueChange,
    granularity,
    hourCycle,
    min,
    max,
    locale,
    disabled: disabled || field?.disabled,
    readOnly,
    required,
    name: name ?? field?.name,
    form,
    controller,
    debug,
  })
  return useSegmentedRoot(
    primitive,
    instance as never,
    field,
    props,
    TimeInputSegment
  )
}

/**
 * A segment, like the hour: an input arrow keys step and digits fill, named
 * by its unit. The text between segments renders as a span.
 * @stable
 */
function TimeInputSegment(props: SegmentProps) {
  return useSegment(primitive, props)
}

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
