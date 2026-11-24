import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type { RadioGroupOptions } from "./radio"

// The radio group's types as functions of its value type `T`, so every
// renderer's `RadioGroup` infers `T` from `value`, `defaultValue` or
// `onValueChange`.
interface RadioGroupGeneric extends PrimitiveGeneric {
  T: string
  options: RadioGroupOptions<this["T"] & string>
}

export type { RadioGroupGeneric }
