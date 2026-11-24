import "@ui-sdk/web/toolbar"
import "@ui-sdk/web/toggle"
import { Bold, createElement, Italic, Link, Underline } from "lucide"
import { log } from "../../../shared/web/log"

const styles = [
  { label: "Bold", icon: Bold },
  { label: "Italic", icon: Italic },
  { label: "Underline", icon: Underline },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toolbar aria-label="Formatting">
      ${styles
        .map(
          (style) => `
            <ui-toggle>
              <button aria-label="${style.label}">
                <ui-toggle-icon>${createElement(style.icon, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
              </button>
            </ui-toggle>
          `
        )
        .join("")}
      <ui-toolbar-separator></ui-toolbar-separator>
      <ui-toolbar-button>
        <button aria-label="Insert link">
          ${createElement(Link, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-toolbar-button>
    </ui-toolbar>
  `
  root.querySelectorAll("ui-toggle").forEach((toggle, index) => {
    const { label } = styles[index]
    toggle.addEventListener("pressedchange", (event) =>
      log(root, `${label} ${event.detail.value ? "on" : "off"}`)
    )
  })
  root
    .querySelector('[aria-label="Insert link"]')!
    .addEventListener("click", () => log(root, "Insert link"))
}

export { mount }
