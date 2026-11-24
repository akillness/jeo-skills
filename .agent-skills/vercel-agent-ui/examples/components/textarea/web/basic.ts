import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field name="message">
      <ui-field-label>Message</ui-field-label>
      <ui-textarea>
        <textarea placeholder="Type your message here…"></textarea>
      </ui-textarea>
    </ui-field>
  `
}

export { mount }
