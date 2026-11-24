import "@ui-sdk/web/separator"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <button type="button" data-variant="solid">Sign In with Passkey</button>
      <div data-slot="row">
        <ui-separator decorative></ui-separator>
        <span>or</span>
        <ui-separator decorative></ui-separator>
      </div>
      <button type="button">Email Me a Link</button>
    </div>
  `
}

export { mount }
