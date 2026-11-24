import "@ui-sdk/web/separator"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      <div data-slot="stack">
        <span>24</span>
        <span data-slot="hint">Projects</span>
      </div>
      <ui-separator orientation="vertical"></ui-separator>
      <div data-slot="stack">
        <span>1,280</span>
        <span data-slot="hint">Followers</span>
      </div>
      <ui-separator orientation="vertical"></ui-separator>
      <div data-slot="stack">
        <span>312</span>
        <span data-slot="hint">Following</span>
      </div>
    </div>
  `
}

export { mount }
