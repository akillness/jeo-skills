import {
  createChange,
  createRovingFocus,
  definePrimitive,
  type ChangeDetails,
} from "@ui-sdk/core"

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
    focused: null as string | null,
  }),
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus(context, {
      slot: "star",
      key: "focused",
      orientation: () => "both",
      loop: () => true,
      remember: false,
      preferred: (star) => Number(star.key) === context.store.get().value,
      claims: (state, star) =>
        state.value ? Number(star.key) === state.value : star.key === "1",
    })
    return {
      roving,
      rate: (value: number, event?: Event) =>
        change("value", value, { reason: "item-press", event }),
      keydown(event: KeyboardEvent, el: HTMLElement) {
        const modified = event.ctrlKey || event.metaKey || event.altKey
        const star = modified
          ? undefined
          : roving.items().find((item) => item.key === event.key)
        if (star) {
          event.preventDefault()
          roving.focus(star.key)
          change("value", Number(star.key), {
            reason: "list-navigation",
            event,
          })
          return
        }

        const moved = roving.keydown(event, el)
        if (moved) {
          change("value", Number(moved.key), {
            reason: "list-navigation",
            event,
          })
        }
      },
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
        tabindex: part.api.roving.tabIndex(state, part),
        "data-filled": Number(part.key) <= state.value ? "" : undefined,
      }),
      press: ({ api, key }, event) => api.rate(Number(key), event),
      on: {
        keydown: (event, { el, api }) => {
          if (el) {
            api.keydown(event, el)
          }
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

export { rating, type RatingOptions }
