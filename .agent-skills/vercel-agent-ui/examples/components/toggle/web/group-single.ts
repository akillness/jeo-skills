import "@ui-sdk/web/toggle"
import {
  createElement,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
} from "lucide"

const alignments = [
  { value: "start", label: "Align start", icon: TextAlignStart, mirror: true },
  {
    value: "center",
    label: "Align center",
    icon: TextAlignCenter,
    mirror: false,
  },
  { value: "end", label: "Align end", icon: TextAlignEnd, mirror: true },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toggle-group default-value="start" deselectable="false" aria-label="Text alignment">
      ${alignments
        .map(
          (item) => `
            <ui-toggle value="${item.value}">
              <button aria-label="${item.label}">
                <ui-toggle-icon${item.mirror ? " mirror" : ""}>${createElement(item.icon, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
              </button>
            </ui-toggle>
          `
        )
        .join("")}
    </ui-toggle-group>
  `
}

export { mount }
