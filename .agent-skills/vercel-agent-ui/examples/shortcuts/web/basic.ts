import { ariaKeyshortcuts, formatShortcut, registerShortcut } from "@ui-sdk/web"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="row">
        <button type="button" data-action="new" aria-keyshortcuts="N">New note <kbd aria-hidden="true" data-slot="kbd">N</kbd></button>
        <button type="button" data-action="save" aria-keyshortcuts="${ariaKeyshortcuts("mod+s")}">Save <kbd aria-hidden="true" data-slot="kbd">${formatShortcut("mod+s")}</kbd></button>
      </div>
      <output data-slot="output">Press N or the keys to save.</output>
    </div>
  `
  const output = root.querySelector("output")!
  const actions = {
    new: () => (output.textContent = "Note created"),
    save: () => (output.textContent = "Saved"),
  }
  root
    .querySelector('[data-action="new"]')!
    .addEventListener("click", actions.new)
  root
    .querySelector('[data-action="save"]')!
    .addEventListener("click", actions.save)

  const offs = [
    registerShortcut("n", actions.new, { description: "New note" }),
    registerShortcut("mod+s", actions.save, { description: "Save" }),
  ]
  return () => offs.forEach((off) => off())
}
