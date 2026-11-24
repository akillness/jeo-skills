import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Check-in</ui-field-label>
      <ui-date-input min="2026-01-01" max="2026-12-31" default-value="2026-06-15"></ui-date-input>
      <ui-field-description>Any day in 2026.</ui-field-description>
      <ui-field-error></ui-field-error>
    </ui-field>
  `
}

export { mount }
