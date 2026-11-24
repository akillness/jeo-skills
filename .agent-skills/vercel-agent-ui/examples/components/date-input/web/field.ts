import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Birthday</ui-field-label>
      <ui-date-input name="birthday"></ui-date-input>
      <ui-field-description>We send a card on the day.</ui-field-description>
    </ui-field>
  `
}

export { mount }
