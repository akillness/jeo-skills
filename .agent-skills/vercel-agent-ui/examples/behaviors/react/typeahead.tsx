import * as React from "react"
import {
  createRovingFocus,
  createTypeahead,
  definePrimitive,
  isTypeaheadKey,
  labelOf,
  selects,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type FruitListState = { focused: string | null }

const fruitList = definePrimitive({
  name: "fruit-list",
  state: (): FruitListState => ({ focused: null }),
  api: (context) => {
    const roving = createRovingFocus<FruitListState, { value: string }>(
      context,
      {
        slot: "item",
        key: "focused",
      }
    )
    const typeahead = createTypeahead()
    return {
      roving,
      keydown(event: KeyboardEvent, el: HTMLElement) {
        if (
          event.defaultPrevented ||
          roving.keydown(event, el) ||
          !isTypeaheadKey(event)
        ) {
          return
        }
        if (event.key === " " && typeahead.active()) {
          event.preventDefault()
        }
        const items = roving.items()
        const index = typeahead(
          event.key,
          items.map((item) => labelOf(item.el)),
          items.findIndex((item) => item.el === el)
        )
        if (index !== -1) {
          roving.focus(items[index].key)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "listbox" }) }),
    item: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        role: "option",
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: { keydown: (event, { el, api }) => api.keydown(event, el!) },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(fruitList, { root: "div", item: "div" })

const FruitList = parts.Root

const FruitListItem = parts.Item

const fruits = ["Apple", "Banana", "Cherry", "Peach", "Pear", "Plum", "Quince"]

function Example() {
  return (
    <FruitList aria-label="Fruit">
      {fruits.map((fruit) => (
        <FruitListItem key={fruit} value={fruit}>
          {fruit}
        </FruitListItem>
      ))}
    </FruitList>
  )
}

export { Example, fruitList, FruitList, FruitListItem, type FruitListState }
