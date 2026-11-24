import { dateInput, type DateInputOptions } from "@ui-sdk/core/date-input"
import { omit } from "solid-js"
import { useFieldControl } from "./field-context"
import {
  renderRoot,
  renderSegment,
  type RootProps,
  type SegmentProps,
} from "./segmented-input"
import { rootScope, usePrimitive } from "./use-primitive"

/**
 * The root: a group of segments the locale orders, like month, day and year,
 * and the hidden input the ISO value submits with. Without children it renders
 * every segment; its children can be a function of its state that renders
 * `state.segments` in a keyed `<For>`.
 * @stable
 */
const DateInput = /* @__PURE__ */ rootScope(function DateInput(
  props: DateInputOptions & RootProps
) {
  const field = useFieldControl()
  const handle = usePrimitive(dateInput, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    granularity: props.granularity,
    hourCycle: props.hourCycle,
    min: props.min,
    max: props.max,
    unavailable: props.unavailable,
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
    "unavailable",
    "locale",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "controller",
    "debug"
  )
  return renderRoot(handle, field, rest, DateInputSegment)
})

/**
 * A segment, like the month: an input arrow keys step and digits fill, named
 * by its unit. The text between segments renders as a span.
 * @stable
 */
function DateInputSegment(props: SegmentProps) {
  return renderSegment(dateInput, props)
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
