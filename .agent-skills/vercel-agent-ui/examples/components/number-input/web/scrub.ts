import "@ui-sdk/web/number-input"
import { createElement, MoveHorizontal } from "lucide"
import { log } from "../../../shared/web/log"

const fields = [
  { label: "X position", handle: "X", defaultValue: 120 },
  { label: "Y position", handle: "Y", defaultValue: 48 },
  { label: "Width", handle: "W", defaultValue: 320, min: 0 },
  { label: "Height", handle: "H", defaultValue: 240, min: 0 },
]

function mount(root: HTMLElement) {
  const title = `frame-${crypto.randomUUID()}`
  root.innerHTML = `
    <div data-slot="card" role="group" aria-labelledby="${title}">
      <h3 id="${title}">Frame</h3>
      <div data-slot="grid">
        ${fields
          .map(
            ({ label, handle, defaultValue, min }) => `
              <ui-number-input default-value="${defaultValue}"${min === undefined ? "" : ` min="${min}"`}>
                <ui-number-input-group>
                  <ui-number-input-scrub-area pixels-per-step="1">
                    <span aria-hidden="true">${handle}</span>
                    <ui-number-input-scrub-area-cursor>
                      ${createElement(MoveHorizontal, { "aria-hidden": "true" }).outerHTML}
                    </ui-number-input-scrub-area-cursor>
                  </ui-number-input-scrub-area>
                  <ui-number-input-control>
                    <input aria-label="${label}" />
                  </ui-number-input-control>
                </ui-number-input-group>
              </ui-number-input>
            `
          )
          .join("")}
      </div>
    </div>
  `
  root.querySelectorAll("ui-number-input").forEach((field, index) => {
    field.addEventListener("valuecommit", (event) => {
      log(root, `${fields[index].label} ${event.detail.value ?? "empty"}`)
    })
  })
}

export { mount }
