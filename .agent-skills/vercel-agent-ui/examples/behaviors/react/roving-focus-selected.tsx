import * as React from "react"
import {
  createChange,
  createRovingFocus,
  definePrimitive,
  selects,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type SizePickerOptions = {
  value?: string
  defaultValue?: string
  onValueChange?: (
    value: string,
    details: ChangeDetails<"item-press" | "list-navigation">
  ) => void
}

type SizePickerState = { value: string | null; focused: string | null }

type SizeProps = { value: string }

const sizePicker = definePrimitive({
  name: "size-picker",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
  },
  state: (options: SizePickerOptions): SizePickerState => ({
    value: options.value ?? options.defaultValue ?? null,
    focused: null,
  }),
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<SizePickerState, SizeProps>(context, {
      slot: "item",
      key: "focused",
      orientation: () => "horizontal",
      loop: () => true,
      remember: false,
      preferred: (item) => item.key === context.store.get().value,
      claims: (state, item) => state.value === null || item.key === state.value,
    })
    return {
      roving,
      choose: (value: string, event?: Event) =>
        change("value", value, { reason: "item-press", event }),
      keydown(event: KeyboardEvent, el: HTMLElement) {
        const moved = roving.keydown(event, el)
        if (moved) {
          change("value", moved.key, { reason: "list-navigation", event })
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "radiogroup" }) }),
    item: slot<SizeProps>({
      props: { value: "string" },
      selects: selects({
        value: ({ key }) => [key, null],
        focused: ({ key }) => [key, null],
      }),
      attrs: (state, part) => ({
        type: "button",
        role: "radio",
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-checked": String(state.value === part.key),
      }),
      press: ({ api, key }, event) => api.choose(key, event),
      on: { keydown: (event, { el, api }) => api.keydown(event, el!) },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(sizePicker, { root: "div", item: "button" })

const SizePicker = parts.Root

const SizePickerItem = parts.Item

function Example() {
  const [size, setSize] = React.useState("M")
  return (
    <div data-slot="stack">
      <SizePicker aria-label="Size" value={size} onValueChange={setSize}>
        {["S", "M", "L", "XL"].map((label) => (
          <SizePickerItem key={label} value={label}>
            {label}
          </SizePickerItem>
        ))}
      </SizePicker>
      <p data-slot="output">Size: {size}</p>
    </div>
  )
}

export {
  Example,
  sizePicker,
  SizePicker,
  SizePickerItem,
  type SizePickerOptions,
}
