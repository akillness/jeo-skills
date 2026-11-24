import { separator } from "@ui-sdk/core/separator"
import { createParts } from "./create-parts"

const parts = createParts(separator, { root: "div" })

/**
 * A line between groups of content, announced as a separator unless it's `decorative`.
 * @stable
 */
const Separator = parts.Root

export { Separator }

export type {
  SeparatorOptions,
  SeparatorOrientation,
  SeparatorPrimitive,
  SeparatorState,
} from "@ui-sdk/core/separator"
