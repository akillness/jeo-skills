import { listbox } from "@ui-sdk/core/listbox"
import { createParts } from "../../src/create-parts"

const {
  Root: Listbox,
  Item: ListboxItem,
  ItemIndicator: ListboxItemIndicator,
} = createParts(listbox, {
  root: "div",
  item: "div",
  "item-indicator": "span",
})

export { Listbox, ListboxItem, ListboxItemIndicator }
