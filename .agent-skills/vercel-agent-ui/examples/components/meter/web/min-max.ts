import type { UiMeterElement } from "@ui-sdk/web"
import "@ui-sdk/web/meter"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-meter value="720" min="300" max="850">
      <ui-meter-label>Credit score</ui-meter-label>
      <ui-meter-value></ui-meter-value>
      <ui-meter-track>
        <ui-meter-indicator></ui-meter-indicator>
      </ui-meter-track>
    </ui-meter>
  `
  const meter = root.querySelector("ui-meter") as UiMeterElement
  meter.format = { style: "decimal" }
}

export { mount }
