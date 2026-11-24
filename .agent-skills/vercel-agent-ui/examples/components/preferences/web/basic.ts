import { createLocalStorage, createPreference } from "@ui-sdk/core"
import "@ui-sdk/web/button"
import "@ui-sdk/web/preferences"
import { log } from "../../../shared/web/log"

const view = createPreference({
  values: ["list", "grid"],
  defaultValue: "list",
  attribute: "data-view",
  storage: createLocalStorage("ui-sdk-preferences-view"),
})

const files = [
  { name: "Q3 roadmap.pdf", detail: "2.4 MB" },
  { name: "Launch checklist.md", detail: "12 KB" },
  { name: "Offsite photos", detail: "24 items" },
  { name: "Brand assets.zip", detail: "18 MB" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-preferences>
      <div data-slot="stack">
        <div data-slot="controls" role="group" aria-label="View">
          <ui-button><button type="button" data-value="list">List</button></ui-button>
          <ui-button><button type="button" data-value="grid">Grid</button></ui-button>
        </div>
        <ul data-slot="files" aria-label="Files">
          ${files.map((file) => `<li><span>${file.name}</span><span data-slot="hint">${file.detail}</span></li>`).join("")}
        </ul>
      </div>
    </ui-preferences>
  `

  const preferences = root.querySelector("ui-preferences")!
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-value]")]
  preferences.preferences = [view]

  const update = () => {
    const { value } = view.get()
    for (const button of buttons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.value === value)
      )
    }
  }
  const choose = (event: MouseEvent) => {
    const next = (event.currentTarget as HTMLButtonElement).dataset.value as
      "list" | "grid"
    view.set(next, { reason: "press", event })
    log(root, `Saved the ${next} view`)
  }

  const stop = view.subscribe(update)
  update()
  for (const button of buttons) {
    button.addEventListener("click", choose)
  }

  return () => {
    stop()
    for (const button of buttons) {
      button.removeEventListener("click", choose)
    }
    preferences.preferences = []
  }
}

export { mount }
