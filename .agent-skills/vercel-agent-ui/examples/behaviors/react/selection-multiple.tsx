import * as React from "react"
import {
  createChange,
  createRovingFocus,
  createSelection,
  definePrimitive,
  selects,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type ToppingsState = { value: string[]; focused: string | null }

const toppings = definePrimitive({
  name: "toppings",
  state: (): ToppingsState => ({ value: ["Cheese"], focused: null }),
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<ToppingsState, { value: string }>(
      context,
      {
        slot: "topping",
        key: "focused",
        orientation: () => "horizontal",
      }
    )
    const selection = createSelection(context, {
      key: "value",
      set: (value, details) => change("value", value, details),
      order: () => roving.items().map((item) => item.key),
      multiple: () => true,
    })
    return {
      roving,
      selection,
      keydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (event.key !== " ") {
          return roving.keydown(event, el)
        }
        event.preventDefault()
        selection.toggle(key, { reason: "item-press", event })
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "listbox", "aria-multiselectable": "true" }),
    }),
    topping: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        role: "option",
        "aria-selected": String(state.value.includes(part.key)),
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: {
        keydown: (event, { el, api, key }) => api.keydown(event, el!, key),
        pointerdown: (event, { api, key }) =>
          api.selection.toggle(key, { reason: "item-press", event }),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(toppings, { root: "div", topping: "div" })

const Toppings = parts.Root

const ToppingsTopping = parts.Topping

const names = ["Cheese", "Basil", "Olives", "Mushrooms", "Peppers"]

function Example() {
  return (
    <Toppings aria-label="Toppings">
      {names.map((name) => (
        <ToppingsTopping key={name} value={name}>
          {name}
        </ToppingsTopping>
      ))}
    </Toppings>
  )
}

export { Example, toppings, Toppings, ToppingsTopping, type ToppingsState }
