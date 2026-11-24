import {
  segmentedControl,
  type SegmentedControlItemProps,
  type SegmentedControlItemState,
  type SegmentedControlOptions,
  type SegmentedControlState,
} from "@ui-sdk/core/segmented-control"
import { omit } from "solid-js"
import { joinField, useFieldControl } from "./field-context"
import { createParts, usePart, type PartProps } from "./use-primitive"

const parts = createParts(segmentedControl, { indicator: "span" })

/**
 * A row of options where exactly one is on, like a radio group drawn as
 * buttons, with an indicator that slides to the checked item.
 * `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @experimental
 */
function SegmentedControl<T extends string = string>(
  props: SegmentedControlOptions<T> &
    Omit<PartProps<"div", SegmentedControlState>, "onChange" | "onSelect">
) {
  const field = useFieldControl()
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "loop",
    "orientation",
    "controller",
    "debug"
  )
  return (
    <parts.Root<T>
      {...props}
      disabled={props.disabled || field?.disabled()}
      name={props.name ?? field?.name()}
    >
      {usePart(
        segmentedControl,
        "root",
        undefined,
        joinField(field, rest, "div"),
        "div"
      )}
    </parts.Root>
  )
}

/**
 * One option, and the hidden native radio that takes part in the form.
 * @experimental
 */
function SegmentedControlItem(
  props: Omit<
    PartProps<"button", SegmentedControlItemState>,
    "value" | "onSelect"
  > &
    SegmentedControlItemProps
) {
  const item = () => ({ value: props.value, disabled: props.disabled })
  const rest = omit(props, "value", "disabled")
  return (
    <>
      {usePart(segmentedControl, "item", item, rest, "button")}
      {usePart(segmentedControl, "input", item, {}, "input")}
    </>
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
