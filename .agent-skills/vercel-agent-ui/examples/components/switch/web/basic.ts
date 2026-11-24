import "@ui-sdk/web/switch"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <label data-slot="label">
      Airplane mode
      <ui-switch>
        <ui-switch-thumb></ui-switch-thumb>
      </ui-switch>
    </label>
  `
}

export { mount }
