import type { slider } from "@ui-sdk/core/slider"
import { getContext } from "svelte"
import type { useFieldControl } from "../field/context"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type SliderContext = PrimitiveHandle<typeof slider> & {
  // The field a single thumb's input joins. A range joins it on the root instead.
  field: () => ReturnType<typeof useFieldControl>
}

const SliderKey = Symbol("slider")

function useSlider(part: string) {
  const context = getContext<SliderContext | undefined>(SliderKey)
  if (!context) {
    throw new Error(`${part} must be used inside <Slider>.`)
  }
  return context
}

export { type SliderContext, SliderKey, useSlider }
