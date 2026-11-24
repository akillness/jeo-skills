import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type { SelectItemProps, SelectOptions } from "./select"

// Select's types as functions of its value type `T`, so every renderer's
// `Select` infers `T` from its value, items or callbacks. The options' union
// on `multiple` types the value, so there's no parameter for it.
interface SelectGeneric extends PrimitiveGeneric {
  T: unknown
  defaults: { T: string }
  options: SelectOptions<this["T"]>
  props: SelectPartProps<this["T"]>
}
type SelectPartProps<T> = { item: SelectItemProps<T> }

export type { SelectGeneric }
