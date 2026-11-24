import "@ui-sdk/web/resizable"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-resizable auto-save-id="docs-persistence">
      <ui-resizable-panel id="docs-sidebar" default-size="30" min-size="20">
        <h3>Outline</h3>
        <ul>
          <li>Introduction</li>
          <li>Installation</li>
          <li>Usage</li>
        </ul>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize outline"><div></div></ui-resizable-handle>
      <ui-resizable-panel id="docs-content" min-size="30">
        <h3>Introduction</h3>
        <span data-slot="hint">Last edited by Wren Takahashi</span>
      </ui-resizable-panel>
    </ui-resizable>
  `
}

export { mount }
