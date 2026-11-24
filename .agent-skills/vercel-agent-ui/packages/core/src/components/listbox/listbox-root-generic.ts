import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type { ListboxItemProps, ListboxOptions } from "./listbox-root"

// Listbox's types as functions of its value type `T`, so every renderer's
// `Listbox` infers `T` from its value, items or callbacks. The options' union
// on `multiple` types the value, so there's no parameter for it.
interface ListboxGeneric extends PrimitiveGeneric {
  T: unknown
  defaults: { T: string }
  options: ListboxOptions<this["T"]>
  props: ListboxPartProps<this["T"]>
}
type ListboxPartProps<T> = { item: ListboxItemProps<T> }

export type { ListboxGeneric }
