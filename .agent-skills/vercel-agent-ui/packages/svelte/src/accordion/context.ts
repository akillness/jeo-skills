import { getContext } from "svelte"

// The value of the item a header, trigger or panel belongs to.
const ItemKey = Symbol("accordion-item")

type ItemContext = () => string

function useItemValue() {
  const value = getContext<ItemContext | undefined>(ItemKey)
  if (!value) {
    throw new Error(
      "Accordion headers, triggers and panels must be used inside <AccordionItem>."
    )
  }
  return value
}

export { type ItemContext, ItemKey, useItemValue }
