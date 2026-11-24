import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type {
  NavigationMenuOptions,
  NavigationMenuState,
} from "./navigation-menu"
import type { NavigationMenuInternalOptions } from "./navigation-menu-api"

// The navigation menu's types as functions of its item value type `T`, so
// every renderer's `NavigationMenu` infers `T` from `value`, `defaultValue`
// or `onValueChange`.
interface NavigationMenuGeneric extends PrimitiveGeneric {
  T: string
  options: NavigationMenuOptions<this["T"] & string> &
    NavigationMenuInternalOptions
  state: NavigationMenuStates<this["T"] & string>
}
type NavigationMenuStates<T extends string> = { root: NavigationMenuState<T> }

export type { NavigationMenuGeneric }
