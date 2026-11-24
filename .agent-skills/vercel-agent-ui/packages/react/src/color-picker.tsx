import {
  colorPicker,
  type ColorPickerChannelInputProps,
  type ColorPickerOptions,
  type ColorPickerState,
} from "@ui-sdk/core/color-picker"
import * as React from "react"
import { controlRender, useFieldControl } from "./field-context"
import { renderElement } from "./render-element"
import {
  createParts,
  usePart,
  usePrimitive,
  type PartProps,
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

type DivProps<State> = Omit<
  PartProps<"div", State>,
  "defaultValue" | "onChange" | "onSelect"
>

type InputProps<State> = Omit<
  PartProps<"input", State>,
  "value" | "defaultValue" | "children" | "readOnly"
>

// The core writes an input's text as it changes, so React only renders where it starts.
function startsAt(render: InputProps<ColorPickerState>["render"]) {
  return (merged: Record<string, any>, state: ColorPickerState) => {
    const { value, ...rest } = merged
    return renderElement(
      "input",
      { ...rest, defaultValue: value },
      render,
      state
    )
  }
}

/**
 * The root: a group around the picker's parts, and the hidden input the form submits.
 * @experimental
 */
function ColorPicker({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  space,
  format,
  gamut,
  disabled,
  readOnly,
  required,
  name,
  form,
  controller,
  debug,
  render,
  children,
  ...props
}: ColorPickerOptions & DivProps<ColorPickerState>) {
  const field = useFieldControl()
  const picker = usePrimitive(colorPicker, {
    value,
    defaultValue,
    onValueChange,
    onValueCommit,
    space,
    format,
    gamut,
    disabled: disabled || field?.disabled,
    readOnly,
    required,
    name: name ?? field?.name,
    form,
    controller,
    debug,
  })
  const root = {
    ...props,
    children: (state: ColorPickerState) => (
      <>
        {typeof children === "function" ? children(state) : children}
        <HiddenInput />
      </>
    ),
    render: controlRender(field, "div", render),
  }
  return usePart(picker, "root", {}, root)
}

function HiddenInput() {
  return usePart(colorPicker, "hidden-input", {}, {}, "input")
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
function ColorPickerInput({ render, ...props }: InputProps<ColorPickerState>) {
  return usePart(
    colorPicker,
    "input",
    {},
    { ...props, render: startsAt(render) },
    "input"
  )
}

/**
 * A number input for one `channel`, in the units people read it in.
 * @experimental
 */
function ColorPickerChannelInput({
  channel,
  render,
  ...props
}: InputProps<ColorPickerState> & ColorPickerChannelInputProps) {
  const id = React.useId()
  return usePart(
    colorPicker,
    "channel-input",
    { id, channel },
    { ...props, render: startsAt(render) },
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
