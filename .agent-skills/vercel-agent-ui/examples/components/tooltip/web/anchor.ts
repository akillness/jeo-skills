import "@ui-sdk/web/tooltip"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { createElement, Info } from "lucide"

function mount(root: HTMLElement) {
  const id = `webhook-url-${crypto.randomUUID()}`
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Webhook URL</ui-field-label>
      <div data-slot="row" id="${id}">
        <ui-input>
          <input placeholder="https://" />
        </ui-input>
        <ui-tooltip>
          <ui-tooltip-trigger>
            <button aria-label="About webhooks">${createElement(Info, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-tooltip-trigger>
          <ui-tooltip-content anchor="#${id}" side="bottom" align="start">
            We send a POST request here for every new order.
          </ui-tooltip-content>
        </ui-tooltip>
      </div>
    </ui-field>
  `
}

export { mount }
