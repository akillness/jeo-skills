import "@ui-sdk/web/resizable"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-resizable>
      <ui-resizable-panel default-size="35" min-size="20" collapsible>
        <h3>Files</h3>
        <span data-slot="hint">35%</span>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize files"></ui-resizable-handle>
      <ui-resizable-panel min-size="30">
        <h3>Editor</h3>
        <span data-slot="hint">65%</span>
      </ui-resizable-panel>
    </ui-resizable>
  `
  const [files, editor] = root.querySelectorAll("[data-slot=hint]")
  root
    .querySelector("ui-resizable")!
    .addEventListener("layoutchange", (event) => {
      const [filesSize, editorSize] = event.detail.value
      files.textContent =
        filesSize === 0 ? "Collapsed" : `${Math.round(filesSize)}%`
      editor.textContent = `${Math.round(editorSize)}%`
    })
}

export { mount }
