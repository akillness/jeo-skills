import "@ui-sdk/web/resizable"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-resizable>
      <ui-resizable-panel default-size="35" min-size="20">
        <h3>Files</h3>
        <ul>
          <li>page.tsx</li>
          <li>layout.tsx</li>
          <li>globals.css</li>
        </ul>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize files"></ui-resizable-handle>
      <ui-resizable-panel default-size="65" min-size="40">
        <ui-resizable orientation="vertical">
          <ui-resizable-panel default-size="60" min-size="30">
            <h3>page.tsx</h3>
            <span data-slot="hint">Saved just now</span>
          </ui-resizable-panel>
          <ui-resizable-handle aria-label="Resize editor"></ui-resizable-handle>
          <ui-resizable-panel default-size="40" min-size="30">
            <h3>Terminal</h3>
            <span data-slot="hint">Ready on port 3000</span>
          </ui-resizable-panel>
        </ui-resizable>
      </ui-resizable-panel>
    </ui-resizable>
  `
}

export { mount }
