import "@ui-sdk/web/resizable"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-resizable>
      <ui-resizable-panel default-size="35" min-size="20">
        <h3>Channels</h3>
        <ul>
          <li>general</li>
          <li>design</li>
          <li>releases</li>
        </ul>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize channels"><div></div></ui-resizable-handle>
      <ui-resizable-panel default-size="65" min-size="20">
        <h3>general</h3>
        <span data-slot="hint">Kofi Mensah: The release notes are ready.</span>
      </ui-resizable-panel>
    </ui-resizable>
  `
}

export { mount }
