import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type { SegmentedControlOptions } from "./segmented-control"

// The segmented control's types as functions of its value type `T`, so every
// renderer's `SegmentedControl` infers `T` from `value`, `defaultValue` or
// `onValueChange`.
interface SegmentedControlGeneric extends PrimitiveGeneric {
  T: string
  options: SegmentedControlOptions<this["T"] & string>
}

export type { SegmentedControlGeneric }
