import "@ui-sdk/web/label"
import "@ui-sdk/web/switch"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      <ui-switch id="updates">
        <ui-switch-thumb></ui-switch-thumb>
      </ui-switch>
      <ui-label for="updates">Email me product updates</ui-label>
    </div>
  `
}

export { mount }
