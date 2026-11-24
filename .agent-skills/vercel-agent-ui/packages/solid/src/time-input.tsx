import { timeInput, type TimeInputOptions } from "@ui-sdk/core/time-input"
import { omit } from "solid-js"
import { useFieldControl } from "./field-context"
import {
  renderRoot,
  renderSegment,
  type RootProps,
  type Segmented,
  type SegmentProps,
} from "./segmented-input"
import { rootScope, usePrimitive, type PrimitiveHandle } from "./use-primitive"

const primitive = timeInput as unknown as Segmented

/**
 * The root: a group of segments, hours and minutes, with seconds and AM/PM
 * when shown, and the hidden input the time submits with. Without children it
 * renders every segment; its children can be a function of its state that
 * renders `state.segments` in a keyed `<For>`.
 * @stable
 */
const TimeInput = /* @__PURE__ */ rootScope(function TimeInput(
  props: TimeInputOptions & RootProps
) {
  const field = useFieldControl()
  const handle = usePrimitive(timeInput, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    granularity: props.granularity,
    hourCycle: props.hourCycle,
    min: props.min,
    max: props.max,
    locale: props.locale,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    required: props.required,
    name: props.name ?? field?.name(),
    form: props.form,
    controller: props.controller,
    debug: props.debug,
  }))
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "granularity",
    "hourCycle",
    "min",
    "max",
    "locale",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "controller",
    "debug"
  )
  return renderRoot(
    handle as unknown as PrimitiveHandle<Segmented>,
    field,
    rest,
    TimeInputSegment
  )
})

/**
 * A segment, like the hour: an input arrow keys step and digits fill, named
 * by its unit. The text between segments renders as a span.
 * @stable
 */
function TimeInputSegment(props: SegmentProps) {
  return renderSegment(primitive, props)
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
