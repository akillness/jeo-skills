import * as React from "react"
import { createInputHistory, definePrimitive, isComposing } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type ComposerOptions = {
  history?: string[]
  onSend?: (message: string) => void
}

const composer = definePrimitive({
  name: "composer",
  options: { history: "value", onSend: "callback" },
  state: (_options: ComposerOptions) => ({ value: "" }),
  api: ({ store, options }) => {
    const write = (value: string) => store.set({ value })
    return {
      write,
      history: createInputHistory({
        entries: () => options().history,
        read: () => store.get().value,
        write,
      }),
      send() {
        const message = store.get().value.trim()
        if (message) {
          options().onSend?.(message)
          write("")
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({ value: state.value, rows: "3" }),
      on: {
        input: (event, { api }) =>
          api.write((event.target as HTMLTextAreaElement).value),
        keydown: (event, { api }) => {
          if (api.history.keydown(event)) {
            return
          }
          if (event.key !== "Enter" || event.shiftKey || isComposing(event)) {
            return
          }
          event.preventDefault()
          api.send()
        },
      },
    }),
  }),
})

const Composer = createParts(composer, { root: "textarea" }).Root

const earlier = [
  "Can you review the launch post?",
  "Agenda for Thursday:\n1. Docs\n2. Launch video\n3. Changelog",
  "Ship it.",
]

function Example() {
  const log = useLog()
  const [sent, setSent] = React.useState(earlier)
  return (
    <Composer
      aria-label="Message"
      placeholder="Write a message…"
      history={sent}
      onSend={(message) => {
        setSent([...sent, message])
        log(`Sent “${message}”`)
      }}
    />
  )
}

export { composer, Composer, type ComposerOptions, Example }
