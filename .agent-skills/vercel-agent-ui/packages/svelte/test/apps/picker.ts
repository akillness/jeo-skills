// A small primitive with a schema, for `createParts`: a group of items, one
// picked, where each item's label takes its value from the item it's in,
// once by the same name and once by the item's prop it names.
import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"

type PickerOptions = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, details: ChangeDetails<"item-press">) => void
}

const picker = definePrimitive({
  name: "picker",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
  },
  state: (options: PickerOptions) => ({
    value: options.value ?? options.defaultValue ?? "",
  }),
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  controlled: ["value"],
  api: (context) => {
    const change = createChange(context)
    return {
      pick: (value: string) => change("value", value, { reason: "item-press" }),
    }
  },
  slots: (slot) => ({
    root: slot<{}, { value: string }>({
      state: (state) => ({ value: state.value }),
      attrs: () => ({ role: "group" }),
    }),
    item: slot<{ value: string }, { picked: boolean }>({
      props: { value: "string" },
      state: (state, { key }) => ({ picked: state.value === key }),
      attrs: (state, { key }) => ({
        "data-picked": state.value === key ? "" : undefined,
      }),
    }),
    label: slot<{ value?: string; item?: string; id?: string }, {}>({
      props: {
        value: { kind: "string", from: "item" },
        item: { kind: "string", from: "item.value" },
        id: "id",
      },
      attrs: (_state, { props }) => ({
        id: props.id,
        "data-value": props.value,
        "data-item": props.item,
      }),
      on: {
        click: (_event, { api, props }) => props.value && api.pick(props.value),
      },
    }),
  }),
})

export { picker }
