import "@ui-sdk/web/resizable"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-resizable>
      <ui-resizable-panel default-size="200px" min-size="160px" max-size="320px">
        <h3>Docs</h3>
        <ul>
          <li>Getting Started</li>
          <li>Components</li>
          <li>Guides</li>
        </ul>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize navigation"><div></div></ui-resizable-handle>
      <ui-resizable-panel min-size="30">
        <h3>Getting Started</h3>
        <span data-slot="hint">Install the packages</span>
      </ui-resizable-panel>
    </ui-resizable>
  `
}

export { mount }
