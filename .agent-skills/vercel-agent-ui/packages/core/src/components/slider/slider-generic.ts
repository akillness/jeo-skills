import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type { SliderOptions } from "./slider"

// Slider's types as functions of its value type `T`, a number or a list of
// them. Unknown here: a renderer narrows `T` by intersecting it, and a number
// intersected with `number | number[]` keeps `number[] & number` beside it.
interface SliderGeneric extends PrimitiveGeneric {
  T: unknown
  defaults: { T: number | number[] }
  // Two arms that each take a type parameter, so a generic wrapper can pass its own `T` on.
  options: SliderOptions<
    this["T"] extends number | number[]
      ? this["T"]
      : this["T"] & (number | number[])
  >
}

export type { SliderGeneric }
