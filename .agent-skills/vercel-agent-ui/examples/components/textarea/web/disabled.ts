import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field disabled>
      <ui-field-label>Reply</ui-field-label>
      <ui-textarea>
        <textarea>Replies are closed for this thread.</textarea>
      </ui-textarea>
    </ui-field>
  `
}

export { mount }
