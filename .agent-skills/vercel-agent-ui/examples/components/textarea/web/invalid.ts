import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field invalid>
      <ui-field-label>Review</ui-field-label>
      <ui-textarea>
        <textarea>Great.</textarea>
      </ui-textarea>
      <ui-field-error match>Write at least 20 characters.</ui-field-error>
    </ui-field>
  `
}

export { mount }
