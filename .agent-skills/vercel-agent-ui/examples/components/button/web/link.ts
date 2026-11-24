import "@ui-sdk/web/button"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      <ui-button><a href="#installation">Get Started</a></ui-button>
      <ui-button disabled><a href="#changelog">Changelog</a></ui-button>
    </div>
  `
}

export { mount }
