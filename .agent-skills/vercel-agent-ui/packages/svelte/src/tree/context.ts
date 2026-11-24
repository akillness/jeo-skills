import { getContext } from "svelte"

// What data items read from the root: whether items have checkboxes.
const DataKey = Symbol("tree-data")
// The item a part belongs to, and the parent of the items in its group.
const ItemKey = Symbol("tree-item")

type DataContext = { checkable: () => boolean }
type ItemContext = {
  value: () => string
  // The props of its label, indicator and checkbox.
  partProps: () => { value: string }
  // A group joins its item, which makes the item a branch, and returns how to leave.
  joinGroup: () => () => void
}

function useItem() {
  const item = getContext<ItemContext | undefined>(ItemKey)
  if (!item) {
    throw new Error(
      "Tree labels, indicators, checkboxes and groups must be used inside <TreeItem>."
    )
  }
  return item
}

export { type DataContext, DataKey, type ItemContext, ItemKey, useItem }
