import { definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type MuteButtonState = { muted: boolean }

const muteButton = definePrimitive({
  name: "mute-button",
  state: () => ({ muted: false }),
  api: (context) => ({
    toggle: () => context.store.set({ muted: !context.store.get().muted }),
  }),
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        type: "button",
        "aria-pressed": String(state.muted),
      }),
      press: ({ api }) => api.toggle(),
    }),
  }),
})

const parts = createParts(muteButton, { root: "button" })

const MuteButton = parts.Root

function Example() {
  return <MuteButton>Mute</MuteButton>
}

export { Example, muteButton, MuteButton, type MuteButtonState }
