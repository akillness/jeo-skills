import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Delivery date</ui-field-label>
      <ui-date-input default-value="2026-11-02"></ui-date-input>
      <ui-field-description>We deliver Monday to Friday.</ui-field-description>
      <ui-field-error></ui-field-error>
    </ui-field>
  `
  root.querySelector("ui-date-input")!.unavailable = { weekday: [0, 6] }
}

export { mount }
