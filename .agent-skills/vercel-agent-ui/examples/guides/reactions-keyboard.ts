import { createRovingFocus, definePrimitive } from "@ui-sdk/core"

const reactions = definePrimitive({
  name: "reactions",
  state: () => ({
    picked: [] as string[],
    focused: null as string | null,
  }),
  api: (context) => ({
    roving: createRovingFocus(context, {
      slot: "reaction",
      key: "focused",
      orientation: () => "horizontal",
    }),
    toggle: (value: string) => {
      const { picked } = context.store.get()
      context.store.set({
        picked: picked.includes(value)
          ? picked.filter((item) => item !== value)
          : [...picked, value],
      })
    },
  }),
  slots: (slot) => ({
    root: slot({}),
    reaction: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        "aria-pressed": String(state.picked.includes(part.key)),
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      press: ({ api, key }) => api.toggle(key),
      on: {
        keydown: (event, { el, api }) => {
          if (el) {
            api.roving.keydown(event, el)
          }
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

export { reactions }
