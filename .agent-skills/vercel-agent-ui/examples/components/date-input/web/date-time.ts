import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Departure</ui-field-label>
      <ui-date-input granularity="minute" default-value="2026-11-02T14:30"></ui-date-input>
    </ui-field>
  `
}

export { mount }
