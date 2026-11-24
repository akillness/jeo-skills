import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"

type RatingOptions = {
  value?: number
  defaultValue?: number
  onValueChange?: (
    value: number,
    details: ChangeDetails<"item-press" | "list-navigation">
  ) => void
}

const rating = definePrimitive({
  name: "rating",
  options: {
    value: "number",
    defaultValue: "number",
    onValueChange: "callback",
  },
  controlled: ["value"],
  state: (options: RatingOptions) => ({
    value: options.value ?? options.defaultValue ?? 0,
  }),
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  api: (context) => {
    const change = createChange(context)

    return {
      rate: (value: number, event?: Event) =>
        change("value", value, { reason: "item-press", event }),
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "radiogroup" }),
    }),
    star: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        role: "radio",
        "aria-checked": String(Number(part.key) === state.value),
        "data-filled": Number(part.key) <= state.value ? "" : undefined,
      }),
      press: ({ api, key }, event) => api.rate(Number(key), event),
    }),
  }),
})

export { rating }
