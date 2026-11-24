// What Date Input and Time Input render alike: the root with its segments and
// hidden input, and a segment, which is an input or the text between inputs.
import type { ChangeDetails } from "@ui-sdk/core"
import type {
  dateInput,
  DateInputController,
  DateInputSegmentData,
  DateInputValueChangeReason,
  DateMatchers,
  HourCycle,
} from "@ui-sdk/core/date-input"
import {
  defineComponent,
  h,
  type ExtractPropTypes,
  type PropType,
  type SetupContext,
} from "vue"
import { slotContent } from "./children"
import { useFieldControl } from "./field-context"
import { withElement } from "./create-parts"
import { readOnlyOf } from "./text-control"
import {
  optionalBoolean,
  orModel,
  useHandle,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"

// Time Input's primitive has the same slots and state.
type Segmented = typeof dateInput

// Date Input adds `unavailable`.
const rootProps = {
  value: { type: String as PropType<string | null>, default: undefined },
  modelValue: { type: String as PropType<string | null>, default: undefined },
  defaultValue: { type: String as PropType<string | null>, default: undefined },
  granularity: String as PropType<"day" | "hour" | "minute" | "second">,
  hourCycle: Number as PropType<HourCycle>,
  min: String,
  max: String,
  locale: String,
  disabled: optionalBoolean,
  readOnly: optionalBoolean,
  required: optionalBoolean,
  name: String,
  form: String,
  controller: Object as PropType<DateInputController>,
  debug: optionalBoolean,
}

const rootEmits = {
  "update:value": (_value: string | null) => true,
  "update:modelValue": (_value: string | null) => true,
  valueChange: (
    _value: string | null,
    _details: ChangeDetails<DateInputValueChangeReason>
  ) => true,
}

type RootProps = ExtractPropTypes<typeof rootProps> & {
  unavailable?: DateMatchers
}

function setupRoot(
  primitive: Segmented,
  Segment: ReturnType<typeof defineSegment>,
  props: RootProps,
  {
    attrs,
    slots,
    emit,
  }: SetupContext<typeof rootEmits, PartSlots<Segmented, "root">>
) {
  const field = useFieldControl()
  const handle = usePrimitive(primitive, () => ({
    value: orModel(props.value, props.modelValue),
    defaultValue: props.defaultValue,
    granularity: props.granularity,
    hourCycle: props.hourCycle,
    min: props.min,
    max: props.max,
    unavailable: props.unavailable,
    locale: props.locale,
    disabled: props.disabled || field?.disabled(),
    readOnly: readOnlyOf(props, attrs),
    required: props.required,
    name: props.name ?? field?.name(),
    form: props.form,
    controller: props.controller,
    debug: props.debug,
    onValueChange: (
      value: string | null,
      details: ChangeDetails<DateInputValueChangeReason>
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
  const hidden = () => h("input", handle.slot("hidden-input"))
  return usePart(handle, "root", undefined, undefined, {
    tag: "div",
    children: (state) => [
      slotContent(slots.default, { state }) ??
        state.segments.map((segment) =>
          h(Segment, { key: segment.key, segment })
        ),
      hidden(),
    ],
    extend: (root) => (field ? field.props(root) : root),
  })
}

// The core writes an input's text as it changes. Vue sets the same text, which the server renders.
function defineSegment(primitive: Segmented, name: string) {
  return withElement(
    "input",
    defineComponent({
      name,
      inheritAttrs: false,
      props: {
        segment: {
          type: Object as PropType<DateInputSegmentData>,
          required: true,
        },
      },
      slots: Object as PartSlots<Segmented, "segment">,
      setup(props, { slots }) {
        const part = () => ({ segment: props.segment, id: props.segment.key })
        // A segment's key, and so whether it's typed in, never changes.
        if (props.segment.editable) {
          return usePart(useHandle(primitive), "segment", part, undefined, {
            tag: "input",
          })
        }
        return usePart(useHandle(primitive), "segment", part, undefined, {
          tag: "span",
          children: (state) =>
            slotContent(slots.default, { state }) ?? state.text,
        })
      },
    })
  )
}

export { defineSegment, rootEmits, rootProps, type Segmented, setupRoot }
