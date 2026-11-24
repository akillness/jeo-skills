import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Start date</ui-field-label>
      <ui-date-input></ui-date-input>
    </ui-field>
  `
}

export { mount }
