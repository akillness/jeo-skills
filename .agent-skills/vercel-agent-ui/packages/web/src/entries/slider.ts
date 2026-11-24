// Importing this defines <ui-slider> and its parts. On the server it does nothing.
import { defineSliderElements } from "../slider"

defineSliderElements()

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
export type { SliderEvents, UiSliderElement } from "../events"
export { createSliderController } from "@ui-sdk/core/slider"
