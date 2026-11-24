import {
  colorPicker,
  type ColorPickerChannelInputProps,
  type ColorPickerState,
} from "@ui-sdk/core/color-picker"
import { createUniqueId, merge, omit, type ComponentProps } from "solid-js"
import { joinField, useFieldControl } from "./field-context"
import { startingText } from "./text-control"
import { createParts, usePart, type PartProps } from "./use-primitive"

const parts = createParts(colorPicker, {
  root: "div",
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

type InputProps = Omit<
  PartProps<"input", ColorPickerState>,
  "value" | "defaultValue" | "children" | "readonly"
>

// Children that take the part's state are called with it. A function that
// takes nothing is a child component's accessor, and goes through as it is.
const resolve = (value: unknown, state: unknown) =>
  typeof value === "function" && value.length > 0 ? value(state) : value

/**
 * The root: a group around the picker's parts, and the hidden input the form submits.
 * @experimental
 */
function ColorPicker(props: ComponentProps<typeof parts.Root>) {
  const field = useFieldControl()
  const root = merge(joinField(field, props, "div"), {
    get disabled() {
      return props.disabled || field?.disabled()
    },
    get name() {
      return props.name ?? field?.name()
    },
    get children() {
      const children = props.children
      return (state: ColorPickerState) => [
        resolve(children, state),
        <HiddenInput />,
      ]
    },
  })
  return <parts.Root {...root} />
}

function HiddenInput() {
  return usePart(colorPicker, "hidden-input", undefined, {}, "input")
}

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
function ColorPickerInput(props: InputProps) {
  return usePart(colorPicker, "input", undefined, startingText(props), "input")
}

/**
 * A number input for one `channel`, in the units people read it in.
 * @experimental
 */
function ColorPickerChannelInput(
  props: InputProps & ColorPickerChannelInputProps
) {
  const id = createUniqueId()
  const part = () => ({ id, channel: props.channel })
  return usePart(
    colorPicker,
    "channel-input",
    part,
    startingText(omit(props, "channel")),
    "input"
  )
}

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
