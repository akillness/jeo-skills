import type { UiMeterElement } from "@ui-sdk/web"
import "@ui-sdk/web/meter"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-meter value="750" max="1000">
      <ui-meter-label>API requests</ui-meter-label>
      <ui-meter-value>750 / 1,000</ui-meter-value>
      <ui-meter-track>
        <ui-meter-indicator></ui-meter-indicator>
      </ui-meter-track>
    </ui-meter>
  `
  const meter = root.querySelector("ui-meter") as UiMeterElement
  meter.getValueLabel = (value, details) =>
    `${value} of ${details.max} requests, ${details.formatted}`
}

export { mount }
