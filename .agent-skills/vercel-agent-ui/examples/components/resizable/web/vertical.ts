import "@ui-sdk/web/resizable"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-resizable orientation="vertical">
      <ui-resizable-panel default-size="45" min-size="25">
        <h3>Inbox</h3>
        <span data-slot="hint">3 unread messages</span>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize inbox"></ui-resizable-handle>
      <ui-resizable-panel default-size="55" min-size="25">
        <h3>Quarterly report</h3>
        <span data-slot="hint">From Hollis Grant</span>
      </ui-resizable-panel>
    </ui-resizable>
  `
}

export { mount }
