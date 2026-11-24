const GroupKey = Symbol("command-group")
// The command an item text part sits in, and its label.
const ItemKey = Symbol("command-item")
// The page parts sit on: `null` for the first page. Not provided outside any page.
const PageKey = Symbol("command-page")
// The shortcut of the command a Shortcut part sits in.
const ItemShortcutKey = Symbol("command-item-shortcut")
// Provided while rendering data commands, whose shortcuts the root binds.
const DataKey = Symbol("command-data")
// Whether a CommandList is among the root's children, so a data command
// knows whether to render its own.
const OwnListKey = Symbol("command-own-list")

type ItemContext = () => { key: string; label?: string }
type PageContext = () => string | null
type ItemShortcutContext = () => string | undefined

export {
  DataKey,
  GroupKey,
  type ItemContext,
  ItemKey,
  type ItemShortcutContext,
  ItemShortcutKey,
  OwnListKey,
  type PageContext,
  PageKey,
}
