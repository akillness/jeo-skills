import "@ui-sdk/web/segmented-control"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div>
      <div data-slot="controls">
        <button type="button">Show Month</button>
      </div>
      <ui-segmented-control aria-label="Range" default-value="week">
        <ui-segmented-control-indicator></ui-segmented-control-indicator>
        <ui-segmented-control-item value="day">Day</ui-segmented-control-item>
        <ui-segmented-control-item value="week">Week</ui-segmented-control-item>
        <ui-segmented-control-item value="month">Month</ui-segmented-control-item>
      </ui-segmented-control>
    </div>
  `
  const range = root.querySelector("ui-segmented-control")!
  range.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    log(root, `value: ${value} (${reason})`)
  })
  root
    .querySelector('[data-slot="controls"] button')!
    .addEventListener("click", () => range.api.setValue("month"))
}

export { mount }
