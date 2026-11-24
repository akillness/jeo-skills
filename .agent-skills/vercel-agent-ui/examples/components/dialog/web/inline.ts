import "@ui-sdk/web/dialog"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="dialog-frame">
      <ui-dialog modal="trap-focus" close-on-outside-press="false">
        <ui-dialog-trigger>
          <button>Delete Draft</button>
        </ui-dialog-trigger>
        <ui-dialog-backdrop hidden></ui-dialog-backdrop>
        <ui-dialog-content inline hidden>
          <div data-slot="stack">
            <ui-dialog-title>Delete this draft?</ui-dialog-title>
            <ui-dialog-description>The preview keeps its dialog inside the frame.</ui-dialog-description>
          </div>
          <div data-slot="row">
            <ui-dialog-close>
              <button>Cancel</button>
            </ui-dialog-close>
            <ui-dialog-close>
              <button data-variant="destructive">Delete</button>
            </ui-dialog-close>
          </div>
        </ui-dialog-content>
      </ui-dialog>
    </div>
  `
}

export { mount }
