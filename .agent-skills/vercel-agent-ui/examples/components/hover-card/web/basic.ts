import "@ui-sdk/web/hover-card"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-hover-card>
      <ui-hover-card-trigger><a href="https://example.com/people/hollis">@hollis</a></ui-hover-card-trigger>
      <ui-hover-card-content hidden>
        <div data-slot="row">
          <span data-slot="initials" aria-hidden="true">HG</span>
          <div data-slot="stack">
            <p>Hollis Grant</p>
            <p>Design engineer on the payments team. Writes about forms and motion.</p>
            <p data-slot="hint">Joined March 2021</p>
          </div>
        </div>
      </ui-hover-card-content>
    </ui-hover-card>
  `
}

export { mount }
