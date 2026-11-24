import "@ui-sdk/web/field"
import "@ui-sdk/web/time-input"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Meeting time</ui-field-label>
      <ui-time-input default-value="09:30"></ui-time-input>
    </ui-field>
  `
}

export { mount }
