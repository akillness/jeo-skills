import * as React from "react"
import { Volume2Icon, VolumeOffIcon } from "lucide-react"
import { createChange, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

const muteButton = definePrimitive({
  name: "mute-button",
  options: { muted: "boolean", onMutedChange: "callback" },
  controlled: ["muted"],
  state: (options: {
    muted?: boolean
    onMutedChange?: (muted: boolean) => void
  }) => ({
    muted: options.muted ?? false,
  }),
  sync: (options) =>
    options.muted === undefined ? {} : { muted: options.muted },
  api: (context) => {
    const change = createChange(context)

    return {
      toggle: (event?: Event) => {
        change("muted", !context.store.get().muted, { reason: "press", event })
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        type: "button",
        "aria-pressed": String(state.muted),
      }),
      press: ({ api }, event) => api.toggle(event),
    }),
  }),
})

const { Root: MuteButton } = createParts(muteButton, { root: "button" })

function Example() {
  const [muted, setMuted] = React.useState(false)

  return (
    <MuteButton muted={muted} onMutedChange={setMuted}>
      {muted ? (
        <VolumeOffIcon aria-hidden="true" />
      ) : (
        <Volume2Icon aria-hidden="true" />
      )}
      {muted ? "Unmute" : "Mute"}
    </MuteButton>
  )
}

export { Example }
