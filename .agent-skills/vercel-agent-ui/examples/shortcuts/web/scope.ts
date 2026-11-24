import { registerShortcut, shortcuts } from "@ui-sdk/web"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <textarea aria-label="Note" placeholder="Write a note…"></textarea>
      <output data-slot="output">Focus the note to turn on its shortcuts.</output>
    </div>
  `
  const textarea = root.querySelector("textarea")!
  const output = root.querySelector("output")!
  textarea.addEventListener("focus", () => shortcuts.setScope("note", true))
  textarea.addEventListener("blur", () => shortcuts.setScope("note", false))

  const offs = [
    registerShortcut(
      "mod+enter",
      () =>
        (output.textContent = `Characters saved: ${textarea.value.trim().length}`),
      {
        scope: "note",
        when: () => textarea.value.trim() !== "",
        description: "Save the note",
      }
    ),
    registerShortcut(
      "escape",
      () => {
        textarea.value = ""
        output.textContent = "Cleared"
      },
      { scope: "note", allowInInput: true, description: "Clear the note" }
    ),
  ]
  return () => {
    offs.forEach((off) => off())
    shortcuts.setScope("note", false)
  }
}
