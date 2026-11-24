import { definePrimitive } from "@ui-sdk/core"

const reactions = definePrimitive({
  name: "reactions",
  state: () => ({ picked: [] as string[] }),
  api: (context) => ({
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
      }),
      press: ({ api, key }) => api.toggle(key),
    }),
  }),
})

export { reactions }
