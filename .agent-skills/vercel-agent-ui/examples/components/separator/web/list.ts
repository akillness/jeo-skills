import "@ui-sdk/web/separator"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <dl>
        <dt>Plan</dt>
        <dd>Pro</dd>
      </dl>
      <ui-separator></ui-separator>
      <dl>
        <dt>Seats</dt>
        <dd>8 of 10</dd>
      </dl>
      <ui-separator></ui-separator>
      <dl>
        <dt>Renews</dt>
        <dd>December 1, 2026</dd>
      </dl>
    </div>
  `
}

export { mount }
