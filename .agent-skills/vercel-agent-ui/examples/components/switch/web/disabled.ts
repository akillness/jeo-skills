import "@ui-sdk/web/switch"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <label data-slot="label">
        Product updates
        <ui-switch>
          <ui-switch-thumb></ui-switch-thumb>
        </ui-switch>
      </label>
      <label data-slot="label">
        Security alerts
        <ui-switch default-checked disabled>
          <ui-switch-thumb></ui-switch-thumb>
        </ui-switch>
      </label>
    </div>
  `
}

export { mount }
