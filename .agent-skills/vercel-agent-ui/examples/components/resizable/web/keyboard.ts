import "@ui-sdk/web/resizable"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-resizable step="5" large-step="25">
      <ui-resizable-panel default-size="50" min-size="20">
        <h3>Original</h3>
        <span data-slot="hint">v1.2.0</span>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize original"></ui-resizable-handle>
      <ui-resizable-panel default-size="50" min-size="20">
        <h3>Changes</h3>
        <span data-slot="hint">v1.3.0</span>
      </ui-resizable-panel>
    </ui-resizable>
  `
}

export { mount }
