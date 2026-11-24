import "@ui-sdk/web/separator"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <nav aria-label="Legal" data-slot="row">
      <a href="#">Privacy</a>
      <ui-separator orientation="vertical"></ui-separator>
      <a href="#">Terms</a>
      <ui-separator orientation="vertical"></ui-separator>
      <a href="#">Cookies</a>
    </nav>
  `
}

export { mount }
