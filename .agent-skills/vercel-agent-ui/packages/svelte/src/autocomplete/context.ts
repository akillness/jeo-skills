import type { PopupContainer } from "../popup.svelte"

const ContainerKey = Symbol("autocomplete-container")
const GroupKey = Symbol("autocomplete-group")
const ItemKey = Symbol("autocomplete-item")
// Whether an AutocompleteContent is among the root's children, so a data
// autocomplete knows whether to render its own.
const OwnContentKey = Symbol("autocomplete-own-content")

type ContainerContext = () => PopupContainer
type ItemContext = () => { key: string; label: string }

export {
  type ContainerContext,
  ContainerKey,
  GroupKey,
  type ItemContext,
  ItemKey,
  OwnContentKey,
}
