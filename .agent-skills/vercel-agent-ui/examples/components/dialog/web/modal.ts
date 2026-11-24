import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/dialog"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const modes = [
  { value: "true", label: "Modal" },
  { value: "trap-focus", label: "Trap focus" },
  { value: "false", label: "Non-modal" },
]

type Mode = "true" | "trap-focus" | "false"

const notes = {
  true: "The rest of the page is inert and doesn't scroll.",
  "trap-focus":
    "Tab stays inside, and the page still scrolls and takes clicks.",
  false:
    "The page stays usable. Tab leaves the notes, and Escape closes them while focus is inside.",
}

const check = createElement(Check, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <ui-select default-value="false">
          <ui-select-label>Modal</ui-select-label>
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content hidden>
            ${modes
              .map(
                (option) => `
                  <ui-select-item value="${option.value}">
                    ${option.label}
                    <ui-select-item-indicator>${check}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
        <label data-slot="label">
          <ui-checkbox>
            <ui-checkbox-indicator>${check}</ui-checkbox-indicator>
          </ui-checkbox>
          Close on outside press
        </label>
      </div>
      <ui-dialog modal="false">
        <ui-dialog-trigger>
          <button>Open Notes</button>
        </ui-dialog-trigger>
        <ui-dialog-content hidden>
          <div data-slot="stack">
            <ui-dialog-title>Notes</ui-dialog-title>
            <ui-dialog-description>${notes.false}</ui-dialog-description>
          </div>
          <textarea aria-label="Notes">Call the printer about the proofs.</textarea>
          <div data-slot="row">
            <ui-dialog-close>
              <button data-variant="solid">Done</button>
            </ui-dialog-close>
          </div>
        </ui-dialog-content>
      </ui-dialog>
    </div>
  `
  const dialog = root.querySelector("ui-dialog")!
  const trigger = root.querySelector("ui-dialog-trigger")!
  const description = root.querySelector("ui-dialog-description")!
  const backdrop = document.createElement("ui-dialog-backdrop")
  root.querySelector("ui-select")!.addEventListener("valuechange", (event) => {
    const mode = event.detail.value as Mode | null
    if (!mode) {
      return
    }
    dialog.setAttribute("modal", mode)
    if (mode === "true") {
      trigger.after(backdrop)
    } else {
      backdrop.remove()
    }
    description.textContent = notes[mode]
  })
  root
    .querySelector("ui-checkbox")!
    .addEventListener("checkedchange", (event) => {
      dialog.setAttribute(
        "close-on-outside-press",
        String(event.detail.value === true)
      )
    })
}

export { mount }
