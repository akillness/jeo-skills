import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type { MenuRadioGroupProps } from "./menu"
import type { MenuInternalOptions } from "./menu-api"

// The menu's types as functions of a radio group's value type `T`, so every
// renderer's `MenuRadioGroup` infers `T` from `value`, `defaultValue` or
// `onValueChange`. The menu's own options don't depend on it.
interface MenuGeneric extends PrimitiveGeneric {
  T: string
  options: MenuInternalOptions
  props: MenuPartProps<this["T"] & string>
}
type MenuPartProps<T extends string> = { "radio-group": MenuRadioGroupProps<T> }

export type { MenuGeneric }
