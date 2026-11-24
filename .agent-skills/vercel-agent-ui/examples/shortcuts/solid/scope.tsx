import { shortcuts, useShortcut } from "@ui-sdk/solid/shortcuts"
import { createSignal } from "solid-js"

export function Example() {
  const [text, setText] = createSignal("")
  const [status, setStatus] = createSignal(
    "Focus the note to turn on its shortcuts."
  )

  useShortcut(
    "mod+enter",
    () => {
      setStatus(`Characters saved: ${text().trim().length}`)
    },
    {
      scope: "note",
      when: () => text().trim() !== "",
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
        value={text()}
        onInput={(event) => setText(event.currentTarget.value)}
        onFocus={() => shortcuts.setScope("note", true)}
        onBlur={() => shortcuts.setScope("note", false)}
      />
      <output data-slot="output">{status()}</output>
    </div>
  )
}
