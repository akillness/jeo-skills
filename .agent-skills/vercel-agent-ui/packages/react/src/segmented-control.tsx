import {
  segmentedControl,
  type SegmentedControlController,
  type SegmentedControlItemProps,
  type SegmentedControlItemState,
  type SegmentedControlOptions,
  type SegmentedControlState,
} from "@ui-sdk/core/segmented-control"
import * as React from "react"
import { controlRender, FieldContext, useJoinField } from "./field-context"
import {
  createParts,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(segmentedControl, { indicator: "span" })

/**
 * A row of options where exactly one is on, like a radio group drawn as
 * buttons, with an indicator that slides to the checked item.
 * `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @experimental
 */
function SegmentedControl<T extends string = string>({
  value,
  defaultValue,
  onValueChange,
  disabled,
  readOnly,
  required,
  name,
  form,
  loop,
  orientation,
  controller,
  debug,
  render,
  ...props
}: SegmentedControlOptions<T> &
  Omit<
    PartProps<"div", SegmentedControlState>,
    "defaultValue" | "onChange" | "onSelect"
  >) {
  const field = useJoinField(React.useContext(FieldContext))
  const control = usePrimitive(segmentedControl, {
    value,
    defaultValue,
    onValueChange: onValueChange as SegmentedControlOptions["onValueChange"],
    disabled: disabled || field?.disabled,
    readOnly,
    required,
    name: name ?? field?.name,
    form,
    loop,
    orientation,
    controller: controller as SegmentedControlController | undefined,
    debug,
  })
  return usePart(
    control,
    "root",
    {},
    { ...props, render: controlRender(field, "div", render) }
  )
}

function SegmentedControlInput(props: SegmentedControlItemProps) {
  return usePart(segmentedControl, "input", props, {}, "input")
}

/**
 * One option, and the hidden native radio that takes part in the form.
 * @experimental
 */
function SegmentedControlItem({
  value,
  disabled,
  render,
  ...props
}: Omit<PartProps<"button", SegmentedControlItemState>, "value" | "onSelect"> &
  SegmentedControlItemProps) {
  const input = <SegmentedControlInput value={value} disabled={disabled} />
  return usePart(
    segmentedControl,
    "item",
    { value, disabled },
    { ...props, render: controlRender(null, "button", render, input) },
    "button"
  )
}

/**
 * Sits behind the checked item. Its box comes from the
 * `--segmented-control-indicator-*` variables, measured from the root.
 * @experimental
 */
const SegmentedControlIndicator = parts.Indicator

export { createSegmentedControlController } from "@ui-sdk/core/segmented-control"
export type {
  SegmentedControlApi,
  SegmentedControlChangeOptions,
  SegmentedControlController,
  SegmentedControlDirection,
  SegmentedControlIndicatorState,
  SegmentedControlItemProps,
  SegmentedControlItemState,
  SegmentedControlOptions,
  SegmentedControlOrientation,
  SegmentedControlPrimitive,
  SegmentedControlState,
  SegmentedControlValueChangeReason,
} from "@ui-sdk/core/segmented-control"

export { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem }
