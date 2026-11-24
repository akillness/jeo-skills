// Importing this defines <ui-color-picker> and its parts. On the server it does nothing.
import { defineColorPickerElements } from "../color-picker"

defineColorPickerElements()

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
export type { ColorPickerEvents, UiColorPickerElement } from "../events"
export { createColorPickerController } from "@ui-sdk/core/color-picker"
