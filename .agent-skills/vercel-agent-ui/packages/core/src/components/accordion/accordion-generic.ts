import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type {
  AccordionItemProps,
  AccordionOptions,
  AccordionState,
} from "./accordion"

// Accordion's types as functions of its item value type `T`, so every
// renderer's `Accordion` infers `T` from `value`, `defaultValue` or
// `onValueChange`.
interface AccordionGeneric extends PrimitiveGeneric {
  T: string
  options: AccordionOptions<this["T"] & string>
  state: AccordionStates<this["T"] & string>
  props: AccordionPartProps<this["T"] & string>
}
type AccordionStates<T extends string> = { root: AccordionState<T> }
type AccordionPartProps<T extends string> = { item: AccordionItemProps<T> }

export type { AccordionGeneric }
