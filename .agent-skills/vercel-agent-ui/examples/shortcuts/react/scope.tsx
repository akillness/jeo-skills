import { shortcuts, useShortcut } from "@ui-sdk/react/shortcuts"
import * as React from "react"

export function Example() {
  const [text, setText] = React.useState("")
  const [status, setStatus] = React.useState(
    "Focus the note to turn on its shortcuts."
  )

  useShortcut(
    "mod+enter",
    () => setStatus(`Characters saved: ${text.trim().length}`),
    {
      scope: "note",
      when: () => text.trim() !== "",
      description: "Save the note",
    }
  )
  useShortcut(
    "escape",
    () => {
      setText("")
      setStatus("Cleared")
    },
    { scope: "note", allowInInput: true, description: "Clear the note" }
  )

  return (
    <div data-slot="stack">
      <textarea
        aria-label="Note"
        placeholder="Write a note…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={() => shortcuts.setScope("note", true)}
        onBlur={() => shortcuts.setScope("note", false)}
      />
      <output data-slot="output">{status}</output>
    </div>
  )
}
