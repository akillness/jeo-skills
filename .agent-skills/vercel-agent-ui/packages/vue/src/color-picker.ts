import {
  colorPicker,
  type ColorChannel,
  type ColorFormat,
  type ColorGamut,
  type ColorPickerController,
  type ColorPickerSpace,
  type ColorPickerValueChangeDetails,
  type ColorPickerValueCommitDetails,
} from "@ui-sdk/core/color-picker"
import { defineComponent, h, useId, type PropType } from "vue"
import { createParts, withElement } from "./create-parts"
import { useFieldControl } from "./field-context"
import { readOnlyOf } from "./text-control"
import {
  optionalBoolean,
  orModel,
  useHandle,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"

const parts = createParts(colorPicker, {
  area: "div",
  "area-thumb": "div",
  "area-canvas": "canvas",
  slider: "div",
  "slider-thumb": "div",
  swatch: "div",
  "eye-dropper": "button",
  swatches: "div",
  "swatch-item": "button",
})

// The hidden input the form submits. Its value changes on every move, so it
// renders on its own.
const ColorPickerHiddenInput = defineComponent({
  name: "ColorPickerHiddenInput",
  setup() {
    const picker = useHandle(colorPicker)
    return () => h("input", picker.slot("hidden-input"))
  },
})

/**
 * The root: a group around the picker's parts, and the hidden input the form submits.
 * @experimental
 */
const ColorPicker = withElement(
  "div",
  defineComponent({
    name: "ColorPicker",
    inheritAttrs: false,
    props: {
      value: { type: String, default: undefined },
      modelValue: { type: String, default: undefined },
      defaultValue: { type: String, default: undefined },
      space: String as PropType<ColorPickerSpace>,
      format: String as PropType<ColorFormat>,
      gamut: {
        type: [String, Boolean] as PropType<ColorGamut | false>,
        default: undefined,
      },
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      required: optionalBoolean,
      name: String,
      form: String,
      controller: Object as PropType<ColorPickerController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: string) => true,
      "update:modelValue": (_value: string) => true,
      valueChange: (_value: string, _details: ColorPickerValueChangeDetails) =>
        true,
      valueCommit: (_value: string, _details: ColorPickerValueCommitDetails) =>
        true,
    },
    slots: Object as PartSlots<typeof colorPicker, "root">,
    setup(props, { slots, emit, attrs }) {
      const field = useFieldControl()
      const picker = usePrimitive(colorPicker, () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        space: props.space,
        format: props.format,
        gamut: props.gamut,
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        required: props.required,
        name: props.name ?? field?.name(),
        form: props.form,
        controller: props.controller,
        debug: props.debug,
        onValueChange: (
          value: string,
          details: ColorPickerValueChangeDetails
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onValueCommit: (
          value: string,
          details: ColorPickerValueCommitDetails
        ) => emit("valueCommit", value, details),
      }))
      return usePart(picker, "root", undefined, undefined, {
        tag: "div",
        children: (state) => [
          slots.default?.({ state }),
          h(ColorPickerHiddenInput),
        ],
        extend: field?.props,
      })
    },
  })
)

/**
 * A surface for two channels, `x` and `y`. Its background comes from
 * `--color-area-background` where gradients draw it, or a `ColorPickerAreaCanvas`.
 * @experimental
 */
const ColorPickerArea = parts.Area

/**
 * The area's thumb: a slider screen readers hear as both channels.
 * @experimental
 */
const ColorPickerAreaThumb = parts.AreaThumb

/**
 * Paints the area pixel by pixel, for channels no gradient draws, like OKLCH's
 * chroma by lightness. Colors outside the gamut stay transparent.
 * @experimental
 */
const ColorPickerAreaCanvas = parts.AreaCanvas

/**
 * A track for one `channel`, drawn by `--color-slider-background`.
 * @experimental
 */
const ColorPickerSlider = parts.Slider

/**
 * The slider's thumb, at `--color-slider-thumb-position`.
 * @experimental
 */
const ColorPickerSliderThumb = parts.SliderThumb

/**
 * A text input that reads any CSS color on Enter or blur. Text that isn't
 * one goes back to the value.
 * @experimental
 */
const ColorPickerInput = withElement(
  "input",
  defineComponent({
    name: "ColorPickerInput",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof colorPicker, "input">,
    setup() {
      // The core writes the text as it changes. Vue sets the same text, which the server renders.
      return usePart(colorPicker, "input", undefined, undefined, {
        tag: "input",
      })
    },
  })
)

/**
 * A number input for one `channel`, in the units people read it in.
 * @experimental
 */
const ColorPickerChannelInput = withElement(
  "input",
  defineComponent({
    name: "ColorPickerChannelInput",
    inheritAttrs: false,
    props: { channel: String as PropType<ColorChannel> },
    slots: Object as PartSlots<typeof colorPicker, "channel-input">,
    setup(props) {
      const id = useId()
      return usePart(
        colorPicker,
        "channel-input",
        () => ({ id, channel: props.channel }),
        undefined,
        {
          tag: "input",
        }
      )
    },
  })
)

/**
 * The color itself, as `--color-picker-color`, named for screen readers.
 * @experimental
 */
const ColorPickerSwatch = parts.Swatch

/**
 * A button that picks a color from the screen, where the browser can.
 * Elsewhere it's disabled, with `data-unsupported`.
 * @experimental
 */
const ColorPickerEyeDropper = parts.EyeDropper

/**
 * A list of preset colors. Arrow keys move between them.
 * @experimental
 */
const ColorPickerSwatches = parts.Swatches

/**
 * A preset color, as `--color-picker-color`. Pressing it sets the value.
 * @experimental
 */
const ColorPickerSwatchItem = parts.SwatchItem

export { createColorPickerController } from "@ui-sdk/core/color-picker"
export type {
  Color,
  ColorChannel,
  ColorFormat,
  ColorGamut,
  ColorPickerApi,
  ColorPickerAreaProps,
  ColorPickerChangeOptions,
  ColorPickerChannelInputProps,
  ColorPickerController,
  ColorPickerOptions,
  ColorPickerPrimitive,
  ColorPickerSliderProps,
  ColorPickerSliderState,
  ColorPickerSpace,
  ColorPickerState,
  ColorPickerSwatchItemProps,
  ColorPickerSwatchItemState,
  ColorPickerValueChangeDetails,
  ColorPickerValueChangeReason,
  ColorPickerValueCommitDetails,
} from "@ui-sdk/core/color-picker"

export {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaCanvas,
  ColorPickerAreaThumb,
  ColorPickerChannelInput,
  ColorPickerEyeDropper,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
  ColorPickerSwatches,
  ColorPickerSwatchItem,
}
