import "@ui-sdk/web/switch"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <div data-slot="stack">
        <ui-field-label>Encrypt backups</ui-field-label>
        <ui-field-description>Your organization manages this setting.</ui-field-description>
      </div>
      <ui-switch name="encrypt" default-checked read-only>
        <ui-switch-thumb></ui-switch-thumb>
      </ui-switch>
    </ui-field>
  `
}

export { mount }
