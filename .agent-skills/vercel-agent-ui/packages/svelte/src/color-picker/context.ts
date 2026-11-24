import type { ColorChannel } from "@ui-sdk/core/color-picker"
import { getContext, setContext } from "svelte"

// The channels an area or a slider edits, for the thumb and canvas inside it.
type ChannelsContext = () => {
  id?: string
  x?: ColorChannel
  y?: ColorChannel
  channel?: ColorChannel
  orientation?: "horizontal" | "vertical"
}

const none: ChannelsContext = () => ({})

const AreaKey = Symbol("color-picker-area")
const SliderKey = Symbol("color-picker-slider")

const provideArea = (channels: ChannelsContext) => setContext(AreaKey, channels)
const provideSlider = (channels: ChannelsContext) =>
  setContext(SliderKey, channels)
const useArea = () => getContext<ChannelsContext | undefined>(AreaKey) ?? none
const useSlider = () =>
  getContext<ChannelsContext | undefined>(SliderKey) ?? none

export { provideArea, provideSlider, useArea, useSlider }
