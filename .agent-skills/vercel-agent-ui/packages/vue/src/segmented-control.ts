import type { ChangeDetails } from "@ui-sdk/core"
import {
  segmentedControl,
  type SegmentedControlController,
  type SegmentedControlOrientation,
  type SegmentedControlValueChangeReason,
} from "@ui-sdk/core/segmented-control"
import { defineComponent, h, type PropType } from "vue"
import { createParts, withElement } from "./create-parts"
import { useFieldControl } from "./field-context"
import { readOnlyOf } from "./text-control"
import {
  optionalBoolean,
  orModel,
  provideProps,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"

const parts = createParts(segmentedControl, { indicator: "span" })

/**
 * A row of options where exactly one is on, like a radio group drawn as
 * buttons, with an indicator that slides to the checked item.
 * @experimental
 */
const SegmentedControl = withElement(
  "div",
  defineComponent({
    name: "SegmentedControl",
    inheritAttrs: false,
    props: {
      value: { type: String as PropType<string | null>, default: undefined },
      modelValue: {
        type: String as PropType<string | null>,
        default: undefined,
      },
      defaultValue: {
        type: String as PropType<string | null>,
        default: undefined,
      },
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      required: optionalBoolean,
      name: String,
      form: String,
      loop: optionalBoolean,
      orientation: String as PropType<SegmentedControlOrientation>,
      controller: Object as PropType<SegmentedControlController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: string | null) => true,
      "update:modelValue": (_value: string | null) => true,
      valueChange: (
        _value: string | null,
        _details: ChangeDetails<SegmentedControlValueChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof segmentedControl, "root">,
    setup(props, { attrs, emit }) {
      const field = useFieldControl()
      const control = usePrimitive(segmentedControl, () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        required: props.required,
        name: props.name ?? field?.name(),
        form: props.form,
        loop: props.loop,
        orientation: props.orientation,
        controller: props.controller,
        debug: props.debug,
        onValueChange: (
          value: string | null,
          details: ChangeDetails<SegmentedControlValueChangeReason>
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
      }))
      return usePart(control, "root", undefined, undefined, {
        tag: "div",
        extend: field?.props,
      })
    },
  })
)

/**
 * One option, and the hidden native radio that takes part in the form.
 * @experimental
 */
const SegmentedControlItem = withElement(
  "button",
  defineComponent({
    name: "SegmentedControlItem",
    inheritAttrs: false,
    props: {
      value: { type: String, required: true },
      disabled: optionalBoolean,
    },
    slots: Object as PartSlots<typeof segmentedControl, "item">,
    setup(props) {
      const control = useScope(segmentedControl)?.handle
      if (!control) {
        throw new Error(
          "SegmentedControlItem must be used inside <SegmentedControl>."
        )
      }
      const item = () => ({ value: props.value, disabled: props.disabled })
      provideProps(segmentedControl, "item", item)
      const button = usePart(control, "item", item, undefined, "button")
      return () => [button(), h("input", control.slot("input", item()))]
    },
  })
)

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
