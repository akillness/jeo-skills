import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field name="notes">
      <ui-field-label>Notes</ui-field-label>
      <ui-textarea auto-resize>
        <textarea placeholder="Add notes for the delivery driver…"></textarea>
      </ui-textarea>
      <ui-field-description>Your driver sees these notes.</ui-field-description>
    </ui-field>
  `
}

export { mount }
