import "@ui-sdk/web/tooltip"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tooltip>
      <ui-tooltip-trigger><a href="https://example.com/changelog" data-variant="link">Changelog</a></ui-tooltip-trigger>
      <ui-tooltip-content>See what's new in 2.0</ui-tooltip-content>
    </ui-tooltip>
  `
}

export { mount }
