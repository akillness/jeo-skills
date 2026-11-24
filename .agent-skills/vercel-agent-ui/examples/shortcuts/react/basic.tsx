import { useShortcut, useShortcutHint } from "@ui-sdk/react/shortcuts"
import * as React from "react"

export function Example() {
  const [status, setStatus] = React.useState("Press N or the keys to save.")
  const newNote = () => setStatus("Note created")
  const save = () => setStatus("Saved")

  useShortcut("n", newNote, { description: "New note" })
  useShortcut("mod+s", save, { description: "Save" })
  const saveHint = useShortcutHint("mod+s")

  return (
    <div data-slot="stack">
      <div data-slot="row">
        <button type="button" onClick={newNote} aria-keyshortcuts="N">
          New note
          <kbd aria-hidden="true" data-slot="kbd">
            N
          </kbd>
        </button>
        <button
          type="button"
          onClick={save}
          aria-keyshortcuts={saveHint.ariaKeyshortcuts}
        >
          Save
          <kbd aria-hidden="true" data-slot="kbd">
            {saveHint.text}
          </kbd>
        </button>
      </div>
      <output data-slot="output">{status}</output>
    </div>
  )
}
