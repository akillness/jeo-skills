import "@ui-sdk/web/toolbar"
import { Clipboard, Copy, createElement, Redo, Scissors, Undo } from "lucide"
import { log } from "../../../shared/web/log"

const clipboard = [
  { label: "Cut", icon: Scissors },
  { label: "Copy", icon: Copy },
  { label: "Paste", icon: Clipboard },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toolbar aria-label="Edit">
      <ui-toolbar-group aria-label="Clipboard">
        ${clipboard
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
      </ui-toolbar-group>
      <ui-toolbar-separator></ui-toolbar-separator>
      <ui-toolbar-group disabled aria-label="History">
        <ui-toolbar-button>
          <button aria-label="Undo">
            ${createElement(Undo, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-toolbar-button>
        <ui-toolbar-button>
          <button aria-label="Redo">
            ${createElement(Redo, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-toolbar-button>
      </ui-toolbar-group>
    </ui-toolbar>
  `
  root
    .querySelectorAll('[aria-label="Clipboard"] button')
    .forEach((button, index) => {
      button.addEventListener("click", () => log(root, clipboard[index].label))
    })
}

export { mount }
