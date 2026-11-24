import "@ui-sdk/web/tooltip"
import type { UiTooltipElement } from "@ui-sdk/web/tooltip"
import { Bold, createElement, Italic, Underline } from "lucide"

const formats = [
  { icon: Bold, label: "Bold" },
  { icon: Italic, label: "Italic" },
  { icon: Underline, label: "Underline" },
]

function mount(root: HTMLElement) {
  const id = `formatting-${crypto.randomUUID()}`
  root.innerHTML = `
    <div data-slot="row" role="group" aria-label="Formatting">
      ${formats
        .map(
          (format) => `
            <ui-tooltip-trigger for="${id}">
              <button aria-label="${format.label}">${createElement(format.icon, { "aria-hidden": "true" }).outerHTML}</button>
            </ui-tooltip-trigger>
          `
        )
        .join("")}
      <ui-tooltip id="${id}">
        <ui-tooltip-content></ui-tooltip-content>
      </ui-tooltip>
    </div>
  `
  root.querySelectorAll("ui-tooltip-trigger").forEach((trigger, index) => {
    trigger.payload = formats[index].label
  })
  const tooltip = root.querySelector<UiTooltipElement<string>>("ui-tooltip")!
  const content = root.querySelector("ui-tooltip-content")!
  tooltip.addEventListener("payloadchange", (event) => {
    content.textContent = event.detail.value ?? ""
  })
}

export { mount }
