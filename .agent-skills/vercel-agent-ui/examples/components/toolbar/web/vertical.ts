import "@ui-sdk/web/toolbar"
import "@ui-sdk/web/toggle"
import {
  createElement,
  MousePointer2,
  Pencil,
  Square,
  Trash2,
  Type,
} from "lucide"
import { log } from "../../../shared/web/log"

const tools = [
  { value: "select", label: "Select", icon: MousePointer2 },
  { value: "draw", label: "Draw", icon: Pencil },
  { value: "shape", label: "Shape", icon: Square },
  { value: "text", label: "Text", icon: Type },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toolbar orientation="vertical" aria-label="Canvas">
      <ui-toggle-group default-value="select" deselectable="false" orientation="vertical" aria-label="Tool">
        ${tools
          .map(
            (tool) => `
              <ui-toggle value="${tool.value}">
                <button aria-label="${tool.label}">
                  <ui-toggle-icon>${createElement(tool.icon, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
                </button>
              </ui-toggle>
            `
          )
          .join("")}
      </ui-toggle-group>
      <ui-toolbar-separator></ui-toolbar-separator>
      <ui-toolbar-button>
        <button aria-label="Delete">
          ${createElement(Trash2, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-toolbar-button>
    </ui-toolbar>
  `
  root
    .querySelector("ui-toggle-group")!
    .addEventListener("valuechange", (event) => {
      const [value] = event.detail.value
      log(root, `${tools.find((tool) => tool.value === value)?.label} tool`)
    })
  root
    .querySelector('[aria-label="Delete"]')!
    .addEventListener("click", () => log(root, "Deleted selection"))
}

export { mount }
