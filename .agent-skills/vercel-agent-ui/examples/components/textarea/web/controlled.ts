import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field name="bio">
      <ui-field-label>Bio</ui-field-label>
      <ui-textarea>
        <textarea maxlength="160">Product designer in Lisbon. I write about type and interfaces.</textarea>
      </ui-textarea>
      <ui-field-description>62 / 160 characters</ui-field-description>
    </ui-field>
  `
  const count = root.querySelector("ui-field-description")!
  root
    .querySelector("ui-textarea")!
    .addEventListener("valuechange", (event) => {
      count.textContent = `${event.detail.value.length} / 160 characters`
    })
}

export { mount }
