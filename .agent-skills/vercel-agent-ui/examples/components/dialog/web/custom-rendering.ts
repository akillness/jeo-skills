import "@ui-sdk/web/dialog"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-dialog>
      <ui-dialog-trigger shortcut="mod+i">
        <button><span>View Details</span><ui-dialog-shortcut></ui-dialog-shortcut></button>
      </ui-dialog-trigger>
      <ui-dialog-backdrop hidden></ui-dialog-backdrop>
      <ui-dialog-content hidden>
        <div data-slot="stack">
          <ui-dialog-title as-child><h3>Details</h3></ui-dialog-title>
          <ui-dialog-description>Quarterly report, updated today.</ui-dialog-description>
        </div>
        <div data-slot="row">
          <ui-dialog-close>
            <button>Close</button>
          </ui-dialog-close>
          <ui-dialog-close>
            <a data-variant="solid" href="https://example.com/details">Open the Full Page</a>
          </ui-dialog-close>
        </div>
      </ui-dialog-content>
    </ui-dialog>
  `
  const label = root.querySelector("ui-dialog-trigger span")!
  const content = root.querySelector("ui-dialog-content")!
  const description = root.querySelector("ui-dialog-description")!
  root.querySelector("ui-dialog")!.addEventListener("openchange", (event) => {
    label.textContent = event.detail.value ? "Viewing" : "View Details"
    description.textContent = content.hasAttribute("data-nested")
      ? "Opened from another dialog."
      : "Quarterly report, updated today."
  })
}

export { mount }
