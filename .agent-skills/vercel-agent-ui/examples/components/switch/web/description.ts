import "@ui-sdk/web/switch"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <div data-slot="stack">
        <ui-field-label>Weekly digest</ui-field-label>
        <ui-field-description>A summary of your week, every Monday.</ui-field-description>
      </div>
      <ui-switch>
        <ui-switch-thumb></ui-switch-thumb>
      </ui-switch>
    </ui-field>
  `
}

export { mount }
