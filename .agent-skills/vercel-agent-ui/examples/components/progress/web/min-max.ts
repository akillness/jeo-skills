import "@ui-sdk/web/progress"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-progress value="3" min="1" max="5">
      <ui-progress-label>Account setup, step 3 of 5</ui-progress-label>
      <ui-progress-value></ui-progress-value>
      <ui-progress-track>
        <ui-progress-indicator></ui-progress-indicator>
      </ui-progress-track>
    </ui-progress>
  `
}

export { mount }
