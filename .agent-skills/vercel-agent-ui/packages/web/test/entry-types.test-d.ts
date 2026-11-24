// Compiled by `pnpm typecheck`, never run. Each `@ts-expect-error` fails the
// build if its line stops being an error.
import type * as Select from "../src/entries/select"
import type { ComboboxValue } from "../src/entries/combobox"
import type { SelectValue } from "../src/entries/select"
import type * as Tree from "../src/entries/tree"

// No element takes the names, so they keep core's meaning: one value or null, or a list with `multiple`.
const one: SelectValue<number> = null
const many: ComboboxValue<string, true> = ["a", "b"]
// @ts-expect-error A select without `multiple` holds one value.
const wrong: SelectValue<number> = [1]

// An entry re-exports core's types by name, so core's functions and
// primitives don't come along as names only a type can use.
// @ts-expect-error Select's entry defines its elements, not core's primitive.
type SelectPrimitive = typeof Select.select
// @ts-expect-error A tree collection comes from `@ui-sdk/core/tree`.
type CreateTreeCollection = typeof Tree.createTreeCollection

export { many, one, wrong }
export type { CreateTreeCollection, SelectPrimitive }
