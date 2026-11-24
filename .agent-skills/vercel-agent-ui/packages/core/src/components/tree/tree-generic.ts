import type { PrimitiveGeneric } from "../../foundation/kernel/primitive-types"
import type { TreeOptions, TreeMode } from "./tree"

// `T` is a string, not a `TreeMode`: TypeScript infers nothing through a
// parameter whose bound is a union of literals.
interface TreeGeneric extends PrimitiveGeneric {
  T: string
  defaults: { T: "single" }
  options: TreeOptions<this["T"] & TreeMode>
}

export type { TreeGeneric }
