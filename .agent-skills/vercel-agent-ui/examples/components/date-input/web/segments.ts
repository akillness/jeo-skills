import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Start date</ui-field-label>
      <ui-date-input default-value="2026-11-02">
        <template>
          <ui-date-input-segment><input /></ui-date-input-segment>
        </template>
      </ui-date-input>
    </ui-field>
  `
}

export { mount }
