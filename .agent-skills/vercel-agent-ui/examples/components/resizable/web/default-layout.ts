import "@ui-sdk/web/resizable"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-resizable default-layout="25,35,40">
      <ui-resizable-panel min-size="15">
        <h3>Mail</h3>
        <ul>
          <li>Inbox</li>
          <li>Drafts</li>
          <li>Sent</li>
        </ul>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize folders"></ui-resizable-handle>
      <ui-resizable-panel min-size="15">
        <h3>Inbox</h3>
        <ul>
          <li>Hollis Grant</li>
          <li>Inès Moreau</li>
          <li>Kofi Mensah</li>
        </ul>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize inbox"></ui-resizable-handle>
      <ui-resizable-panel min-size="15">
        <h3>Quarterly report</h3>
        <span data-slot="hint">From Hollis Grant</span>
      </ui-resizable-panel>
    </ui-resizable>
  `
}

export { mount }
