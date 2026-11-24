import "@ui-sdk/web/field"
import "@ui-sdk/web/input"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-field>
        <ui-field-label>Username</ui-field-label>
        <ui-input>
          <input name="username" placeholder="hollis" autocomplete="username" />
        </ui-input>
        <ui-field-description>Choose a unique username for your account.</ui-field-description>
      </ui-field>
    </div>
  `
}

export { mount }
