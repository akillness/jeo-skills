import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type {
  ComboboxChipProps,
  ComboboxItemProps,
  ComboboxOptions,
} from "./combobox"

// Combobox's types as functions of its value type `T`, so every renderer's
// `Combobox` infers `T` from its value, items or callbacks. The options'
// union on `multiple` types the value, so there's no parameter for it.
interface ComboboxGeneric extends PrimitiveGeneric {
  T: unknown
  defaults: { T: string }
  options: ComboboxOptions<this["T"]>
  props: ComboboxPartProps<this["T"]>
}
type ComboboxPartProps<T> = {
  item: ComboboxItemProps<T>
  chip: ComboboxChipProps<T>
}

export type { ComboboxGeneric }
