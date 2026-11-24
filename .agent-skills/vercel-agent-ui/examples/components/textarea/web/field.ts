import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field name="feedback">
      <ui-field-label>Feedback</ui-field-label>
      <ui-textarea>
        <textarea placeholder="What could we do better?"></textarea>
      </ui-textarea>
      <ui-field-description>Only the product team can see this.</ui-field-description>
    </ui-field>
  `
}

export { mount }
