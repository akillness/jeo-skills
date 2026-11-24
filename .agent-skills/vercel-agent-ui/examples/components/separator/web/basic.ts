import "@ui-sdk/web/separator"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="stack">
        <h3>Hollis Grant</h3>
        <p data-slot="hint">hollis@example.com</p>
      </div>
      <ui-separator></ui-separator>
      <p>Designs the billing and onboarding flows, and reviews every new pricing page.</p>
    </div>
  `
}

export { mount }
