import "@ui-sdk/web/toolbar"
import { registerShortcut } from "@ui-sdk/web"
import { Bold, createElement, Italic, Link } from "lucide"
import { log } from "../../../shared/web/log"

const actions = [
  { label: "Bold", icon: Bold },
  { label: "Italic", icon: Italic },
  { label: "Insert link", icon: Link },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Focus Toolbar</button>
      </div>
      <ui-toolbar aria-label="Notes formatting">
        ${actions
          .map(
            (action) => `
              <ui-toolbar-button>
                <button aria-label="${action.label}">
                  ${createElement(action.icon, { "aria-hidden": "true" }).outerHTML}
                </button>
              </ui-toolbar-button>
            `
          )
          .join("")}
      </ui-toolbar>
      <textarea aria-label="Notes" placeholder="Type, then press Alt+F10"></textarea>
    </div>
  `
  const toolbar = root.querySelector("ui-toolbar")!
  root
    .querySelector('[data-slot="controls"] button')!
    .addEventListener("click", () => toolbar.api.focus())
  toolbar.querySelectorAll("button").forEach((button, index) => {
    button.addEventListener("click", () => log(root, actions[index].label))
  })
  return registerShortcut("alt+f10", () => toolbar.api.focus(), {
    allowInInput: true,
  })
}

export { mount }
