import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type { TriggerMenuItemProps, TriggerMenuOptions } from "./trigger-menu"

// The trigger menu's types as functions of its item value type `T`, so every
// renderer's `TriggerMenu` infers `T` from its triggers' items or `onSelect`.
interface TriggerMenuGeneric extends PrimitiveGeneric {
  T: unknown
  defaults: { T: string }
  options: TriggerMenuOptions<this["T"]>
  props: TriggerMenuPartProps<this["T"]>
}
type TriggerMenuPartProps<T> = { item: TriggerMenuItemProps<T> }

export type { TriggerMenuGeneric }
