import "@ui-sdk/web/meter"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-meter value="42">
      <ui-meter-label>Battery</ui-meter-label>
      <ui-meter-value></ui-meter-value>
      <ui-meter-track>
        <ui-meter-indicator></ui-meter-indicator>
      </ui-meter-track>
    </ui-meter>
  `
}

export { mount }
