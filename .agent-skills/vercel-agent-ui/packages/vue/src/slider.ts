import type { StateOf } from "@ui-sdk/core"
import {
  slider as sliderPrimitive,
  type NumberFormat,
  type SliderController,
  type SliderOptions,
  type SliderValueChangeDetails,
  type SliderValueCommitDetails,
} from "@ui-sdk/core/slider"
import {
  computed,
  defineComponent,
  h,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import { slotContent } from "./children"
import { useFieldControl, useFieldControlId } from "./field-context"
import {
  createParts,
  type RootInstanceOf,
  type RootPropsOf,
  withElement,
} from "./create-parts"
import {
  optionalBoolean,
  orModel,
  useHandle,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"

// The field a single thumb's input joins. A range joins it on the root instead.
const ThumbFieldKey: InjectionKey<() => ReturnType<typeof useFieldControl>> =
  Symbol("slider-field")

const useSlider = () => useHandle(sliderPrimitive)

const parts = createParts(sliderPrimitive, {
  control: "div",
  track: "div",
  indicator: "div",
})

type Value = number | number[]

// Generic over the value, like React's `Slider<Value>`: a number for one
// thumb, or an array for a range, through `v-model` and its events.
type SliderProps<V extends Value> = SliderOptions<V>
type SliderComponent = new <V extends Value = Value>(
  props: RootPropsOf<SliderProps<V>, "div">
) => RootInstanceOf<
  SliderProps<V>,
  StateOf<typeof sliderPrimitive, "root">,
  "div"
>

// The hidden input the form submits. Its value changes on every move, so it
// renders on its own, and the root and its content don't render again.
const SliderInput = defineComponent({
  name: "SliderInput",
  setup() {
    const slider = useSlider()
    return () => h("input", slider.slot("input"))
  },
})

/**
 * The root: a group around the thumbs, and the hidden input the form submits.
 * @stable
 */
const Slider = defineComponent({
  name: "Slider",
  inheritAttrs: false,
  props: {
    value: { type: [Number, Array] as PropType<Value>, default: undefined },
    modelValue: {
      type: [Number, Array] as PropType<Value>,
      default: undefined,
    },
    defaultValue: {
      type: [Number, Array] as PropType<Value>,
      default: undefined,
    },
    min: Number,
    max: Number,
    step: Number,
    largeStep: Number,
    minStepsBetweenThumbs: Number,
    orientation: String as PropType<"horizontal" | "vertical">,
    disabled: optionalBoolean,
    readOnly: optionalBoolean,
    required: optionalBoolean,
    name: String,
    form: String,
    format: [Object, Function] as PropType<NumberFormat>,
    locale: String,
    controller: Object as PropType<SliderController>,
    debug: optionalBoolean,
  },
  emits: {
    "update:value": (_value: Value) => true,
    "update:modelValue": (_value: Value) => true,
    valueChange: (_value: Value, _details: SliderValueChangeDetails) => true,
    valueCommit: (_value: Value, _details: SliderValueCommitDetails) => true,
  },
  slots: Object as PartSlots<typeof sliderPrimitive, "root">,
  setup(props, { slots, emit }) {
    const field = useFieldControl()
    const controlId = useFieldControlId()
    const model = () => orModel(props.value, props.modelValue)
    const slider = usePrimitive(sliderPrimitive, () => ({
      value: model(),
      defaultValue: props.defaultValue,
      min: props.min,
      max: props.max,
      step: props.step,
      largeStep: props.largeStep,
      minStepsBetweenThumbs: props.minStepsBetweenThumbs,
      orientation: props.orientation,
      disabled: props.disabled || field?.disabled(),
      readOnly: props.readOnly,
      required: props.required,
      name: props.name ?? field?.name(),
      form: props.form,
      format: props.format,
      locale: props.locale,
      controller: props.controller,
      thumbInputId: controlId,
      debug: props.debug,
      onValueChange: (value: Value, details: SliderValueChangeDetails) => {
        // The change event runs first, so canceling it also keeps v-model as it was.
        emit("valueChange", value, details)
        if (details.canceled) {
          return
        }
        emit("update:value", value)
        emit("update:modelValue", value)
      },
      onValueCommit: (value: Value, details: SliderValueCommitDetails) =>
        emit("valueCommit", value, details),
    }))
    // A range is a group the field's label names. A single thumb is the
    // control itself. Computed, so a v-model value that moves doesn't render
    // every range input again, which reads it through `field`.
    const isRange = computed(() => {
      const shape = model() ?? props.defaultValue
      return Array.isArray(shape) && shape.length > 1
    })
    provide(ThumbFieldKey, () => (isRange.value ? null : field))
    return usePart(slider, "root", undefined, undefined, {
      tag: "div",
      children: (state) => [slots.default?.({ state }), h(SliderInput)],
      extend: (root) => (isRange.value && field ? field.props(root) : root),
    })
  },
}) as unknown as SliderComponent

/**
 * Where presses land. A press on the track moves the nearest thumb there.
 * @stable
 */
const SliderControl = parts.Control
/**
 * The rail the thumbs move along. Positions are percentages of it.
 * @stable
 */
const SliderTrack = parts.Track
/**
 * The filled part of the track: up to a single thumb, or between a range's thumbs.
 * @stable
 */
const SliderIndicator = parts.Indicator

const inputAttributes = ["aria-label", "aria-labelledby", "aria-describedby"]

// A thumb's range input. Its bounds follow the thumbs beside it, so it
// renders on its own when they move, and the thumb and its content don't.
const SliderThumbInput = defineComponent({
  name: "SliderThumbInput",
  inheritAttrs: false,
  props: { index: { type: Number, required: true } },
  setup(props, { attrs }) {
    const slider = useSlider()
    const thumbField = inject(ThumbFieldKey, () => null)
    return () => {
      const input = slider.slot(
        "thumb-input",
        { index: props.index, id: String(props.index) },
        attrs
      )
      const field = thumbField()
      return h("input", field ? field.props(input) : input)
    }
  },
})

/**
 * A thumb, with the native range input that takes focus inside it. Its
 * `aria-label`, `aria-labelledby` and `aria-describedby` go to that input.
 * @stable
 */
const SliderThumb = withElement(
  "div",
  defineComponent({
    name: "SliderThumb",
    inheritAttrs: false,
    props: { index: { type: Number, default: 0 } },
    slots: Object as PartSlots<typeof sliderPrimitive, "thumb">,
    setup(props, { slots, attrs }) {
      const thumb = () => ({ index: props.index, id: String(props.index) })
      // The input's naming attributes go to it, and the rest to the thumb.
      let named: Record<string, unknown> = {}
      const own = () => {
        const rest: Record<string, unknown> = {}
        named = {}
        for (const [key, value] of Object.entries(attrs)) {
          ;(inputAttributes.includes(key) ? named : rest)[key] = value
        }
        return rest
      }
      return usePart(useSlider(), "thumb", thumb, own, {
        tag: "div",
        children: (state) => [
          slots.default?.({ state }),
          h(SliderThumbInput, { index: props.index, ...named }),
        ],
      })
    },
  })
)

/**
 * The formatted value, a range joined with an en dash. Content replaces it.
 * @stable
 */
const SliderValue = withElement(
  "output",
  defineComponent({
    name: "SliderValue",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof sliderPrimitive, "value">,
    setup(_, { slots }) {
      return usePart(useSlider(), "value", undefined, undefined, {
        tag: "output",
        children: (state) =>
          slotContent(slots.default, { state }) ?? state.text,
      })
    },
  })
)

export { createSliderController } from "@ui-sdk/core/slider"
export type {
  NumberFormat,
  SliderApi,
  SliderChangeOptions,
  SliderController,
  SliderOptions,
  SliderPrimitive,
  SliderState,
  SliderThumbProps,
  SliderThumbState,
  SliderValueChangeDetails,
  SliderValueChangeReason,
  SliderValueCommitDetails,
  SliderValueState,
} from "@ui-sdk/core/slider"

export {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
}
