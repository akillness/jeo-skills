import * as React from "react"
import {
  createChange,
  createListbox,
  definePrimitive,
  selects,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type FruitPickerState = {
  value: string | null
  query: string
  highlighted: string | null
}

type FruitPickerOptions = {
  onValueChange?: (
    value: string | null,
    details: ChangeDetails<"item-press">
  ) => void
}

type FruitProps = { value: string; label?: string }

const fruitPicker = definePrimitive({
  name: "fruit-picker",
  options: { onValueChange: "callback" },
  state: (_options: FruitPickerOptions): FruitPickerState => ({
    value: null,
    query: "",
    highlighted: null,
  }),
  api: (context) => {
    const change = createChange(context)
    const listbox = createListbox(context, {
      key: "highlighted",
      focus: "virtual",
      query: () => context.store.get().query,
    })
    const choose = (key: string, event?: Event) =>
      change("value", key, { reason: "item-press", event })
    return {
      listbox,
      choose,
      search(query: string) {
        context.store.set({ query })
        listbox.move("first")
      },
      keydown(event: KeyboardEvent) {
        const { highlighted } = context.store.get()
        if (event.key === "Enter" && highlighted !== null) {
          event.preventDefault()
          choose(highlighted, event)
          return
        }
        listbox.keydown(event)
      },
    }
  },
  slots: (slot) => ({
    root: slot({}),
    input: slot({
      attrs: (state, { id, api }) => ({
        role: "combobox",
        "aria-expanded": "true",
        "aria-controls": `${id}-list`,
        "aria-autocomplete": "list",
        "aria-activedescendant": api.listbox.activeId(state),
      }),
      on: {
        input: (event, { api }) =>
          api.search((event.target as HTMLInputElement).value),
        keydown: (event, { api }) => api.keydown(event),
      },
    }),
    list: slot({
      attrs: (_state, { id }) => ({ id: `${id}-list`, role: "listbox" }),
    }),
    option: slot<FruitProps>({
      role: "option",
      focus: "active-descendant",
      props: { value: "string", label: "string" },
      selects: selects({ highlighted: ({ key }) => [key, null] }),
      present: (_state, part) => part.api.listbox.shows(part),
      attrs: (state, part) => ({
        ...part.api.listbox.attrs(state, part),
        "aria-selected": String(state.value === part.key),
      }),
      press: ({ key, api }, event) => api.choose(key, event),
      on: {
        pointerdown: (event) => event.preventDefault(),
        pointermove: (event, { key, api }) =>
          api.listbox.highlight(key, { event }),
      },
      bind: (el, part) => part.api.listbox.bind(el, part),
    }),
  }),
})

const parts = createParts(fruitPicker, {
  root: "div",
  input: "input",
  list: "div",
  option: "div",
})

const FruitPicker = parts.Root

const FruitPickerInput = parts.Input

const FruitPickerList = parts.List

const FruitPickerOption = parts.Option

const fruits = [
  "Apple",
  "Apricot",
  "Banana",
  "Blueberry",
  "Cherry",
  "Grape",
  "Mango",
  "Peach",
  "Pear",
  "Plum",
]

function Example() {
  const log = useLog()
  return (
    <FruitPicker
      onValueChange={(value: string | null) => log(`Chose ${value}`)}
    >
      <FruitPickerInput aria-label="Fruit" placeholder="Search fruit" />
      <FruitPickerList aria-label="Fruit">
        {fruits.map((fruit) => (
          <FruitPickerOption key={fruit} value={fruit}>
            {fruit}
          </FruitPickerOption>
        ))}
      </FruitPickerList>
    </FruitPicker>
  )
}

export {
  Example,
  fruitPicker,
  FruitPicker,
  FruitPickerInput,
  FruitPickerList,
  FruitPickerOption,
  type FruitPickerOptions,
  type FruitPickerState,
}
