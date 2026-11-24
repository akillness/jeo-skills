// Checked by svelte-check, not run. Each `@ts-expect-error` fails the check
// if its line stops being an error.
// An entry re-exports core's types by name, so core's functions and
// primitives don't come along as names only a type can use.
import type * as Combobox from "../../src/combobox"
import type * as Select from "../../src/select"
import type * as Shortcuts from "../../src/shortcuts"
import type * as Tree from "../../src/tree"

type Reexported = [Select.SelectOptions, Tree.TreeOptions]
// Core's value types, under names the components that took theirs leave free.
type ValueData = [
  Select.SelectValueData<string, true>,
  Combobox.ComboboxValueData<number>,
]
// @ts-expect-error Select's entry exports its parts, not core's primitive.
type SelectPrimitive = typeof Select.select
// @ts-expect-error A tree collection comes from `@ui-sdk/core/tree`.
type CreateTreeCollection = typeof Tree.createTreeCollection
// @ts-expect-error Matching a shortcut comes from `@ui-sdk/core/shortcuts`.
type MatchesShortcut = typeof Shortcuts.matchesShortcut

export type {
  CreateTreeCollection,
  MatchesShortcut,
  Reexported,
  SelectPrimitive,
  ValueData,
}
