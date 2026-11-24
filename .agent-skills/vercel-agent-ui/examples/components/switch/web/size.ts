import "@ui-sdk/web/switch"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <label data-slot="label">
        Small
        <ui-switch data-size="sm">
          <ui-switch-thumb></ui-switch-thumb>
        </ui-switch>
      </label>
      <label data-slot="label">
        Default
        <ui-switch>
          <ui-switch-thumb></ui-switch-thumb>
        </ui-switch>
      </label>
    </div>
  `
}

export { mount }
