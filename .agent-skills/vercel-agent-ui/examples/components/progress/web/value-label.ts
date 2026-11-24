import type { GaugeLabelDetails } from "@ui-sdk/core/progress"
import "@ui-sdk/web/progress"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-progress value="3" max="12">
      <ui-progress-label>Copying files</ui-progress-label>
      <ui-progress-value>3 of 12</ui-progress-value>
      <ui-progress-track>
        <ui-progress-indicator></ui-progress-indicator>
      </ui-progress-track>
    </ui-progress>
  `
  const progress = root.querySelector("ui-progress") as HTMLElement & {
    getValueLabel: (value: number | null, details: GaugeLabelDetails) => string
  }
  progress.getValueLabel = (value, details) =>
    `${value} of ${details.max} files, ${details.formatted}`
}

export { mount }
