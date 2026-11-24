import "@ui-sdk/web/progress"

function mount(root: HTMLElement) {
  const value = 18
  root.innerHTML = `
    <ui-progress value="${value}">
      <ui-progress-label>Battery</ui-progress-label>
      <span data-slot="hint" aria-hidden="true"><ui-progress-value></ui-progress-value> charged</span>
      <ui-progress-track>
        <ui-progress-indicator${value < 20 ? ' data-variant="destructive"' : ""}></ui-progress-indicator>
      </ui-progress-track>
    </ui-progress>
  `
}

export { mount }
