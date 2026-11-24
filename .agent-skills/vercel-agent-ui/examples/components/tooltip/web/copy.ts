import "@ui-sdk/web/tooltip"
import { Check, Copy, createElement } from "lucide"

const command = "npm install @ui-sdk/web"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      <code>${command}</code>
      <ui-tooltip close-on-press="false">
        <ui-tooltip-trigger><button></button></ui-tooltip-trigger>
        <ui-tooltip-content></ui-tooltip-content>
      </ui-tooltip>
    </div>
  `
  const tooltip = root.querySelector("ui-tooltip")!
  const button = root.querySelector("button")!
  const content = root.querySelector("ui-tooltip-content")!
  const render = (copied: boolean) => {
    const label = copied ? "Copied" : "Copy"
    button.setAttribute("aria-label", label)
    button.replaceChildren(
      createElement(copied ? Check : Copy, { "aria-hidden": "true" })
    )
    content.textContent = label
  }
  render(false)
  button.addEventListener("click", () => {
    navigator.clipboard?.writeText(command).catch(() => {})
    render(true)
  })
  tooltip.addEventListener("openchangecomplete", (event) => {
    if (!event.detail.value) {
      render(false)
    }
  })
}

export { mount }
