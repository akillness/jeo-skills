import "@ui-sdk/web/toggle"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toggle>
      <button type="button" data-variant="outline">
        Bookmark
      </button>
    </ui-toggle>
  `
}

export { mount }
