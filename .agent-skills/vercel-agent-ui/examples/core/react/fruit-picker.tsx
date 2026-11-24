import * as React from "react"
import {
  createTypeahead,
  definePrimitive,
  elements,
  idPart,
  isTypeaheadKey,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type FruitPickerState = { fruit: string }

const fruitPicker = definePrimitive({
  name: "fruit-picker",
  state: (): FruitPickerState => ({ fruit: "Apple" }),
  api: (context) => {
    const typeahead = createTypeahead()
    return {
      keydown(event: KeyboardEvent) {
        const fruits = elements(context, "option").map((option) => option.key)
        const current = fruits.indexOf(context.store.get().fruit)
        let next = -1
        if (event.key === "ArrowDown") {
          next = Math.min(current + 1, fruits.length - 1)
        } else if (event.key === "ArrowUp") {
          next = Math.max(current - 1, 0)
        } else if (isTypeaheadKey(event)) {
          next = typeahead(event.key, fruits, current)
        }
        if (next === -1) {
          return
        }
        event.preventDefault()
        context.store.set({ fruit: fruits[next] })
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}>({
      attrs: (state, part) => ({
        role: "listbox",
        tabindex: "0",
        "aria-activedescendant": `${part.id}-${idPart(state.fruit)}`,
      }),
      on: { keydown: (event, { api }) => api.keydown(event) },
    }),
    option: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        role: "option",
        id: `${part.id}-${idPart(part.key)}`,
        "aria-selected": String(state.fruit === part.key),
      }),
    }),
  }),
})

const parts = createParts(fruitPicker, { root: "div", option: "div" })

const FruitPicker = parts.Root

const FruitPickerOption = parts.Option

const fruits = ["Apple", "Banana", "Cherry", "Peach", "Pear", "Plum", "Quince"]

function Example() {
  return (
    <FruitPicker aria-label="Fruit">
      {fruits.map((fruit) => (
        <FruitPickerOption key={fruit} value={fruit}>
          {fruit}
        </FruitPickerOption>
      ))}
    </FruitPicker>
  )
}

export {
  Example,
  fruitPicker,
  FruitPicker,
  FruitPickerOption,
  type FruitPickerState,
}
