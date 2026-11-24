import "@ui-sdk/web/progress"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-progress>
      <ui-progress-label>Connecting to server</ui-progress-label>
      <ui-progress-track>
        <ui-progress-indicator></ui-progress-indicator>
      </ui-progress-track>
    </ui-progress>
  `
}

export { mount }
