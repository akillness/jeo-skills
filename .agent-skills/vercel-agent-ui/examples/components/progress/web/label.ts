import "@ui-sdk/web/progress"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-progress value="56">
      <ui-progress-label>Upload progress</ui-progress-label>
      <ui-progress-value></ui-progress-value>
      <ui-progress-track>
        <ui-progress-indicator></ui-progress-indicator>
      </ui-progress-track>
    </ui-progress>
  `
}

export { mount }
