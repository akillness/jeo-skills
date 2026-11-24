import "@ui-sdk/web/label"
import "@ui-sdk/web/radio"

const speeds = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-label for="shipping-speed">Shipping speed</ui-label>
      <ui-radio-group id="shipping-speed" default-value="standard">
        ${speeds
          .map(
            (speed) => `
              <ui-label>
                <ui-radio value="${speed.value}">
                  <ui-radio-indicator></ui-radio-indicator>
                </ui-radio>
                ${speed.label}
              </ui-label>
            `
          )
          .join("")}
      </ui-radio-group>
    </div>
  `
}

export { mount }
