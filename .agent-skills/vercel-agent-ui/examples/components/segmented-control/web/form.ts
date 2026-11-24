import "@ui-sdk/web/field"
import "@ui-sdk/web/segmented-control"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field>
        <ui-field-label>Theme</ui-field-label>
        <ui-segmented-control name="theme" required default-value="system">
          <ui-segmented-control-indicator></ui-segmented-control-indicator>
          <ui-segmented-control-item value="light">Light</ui-segmented-control-item>
          <ui-segmented-control-item value="dark">Dark</ui-segmented-control-item>
          <ui-segmented-control-item value="system">System</ui-segmented-control-item>
        </ui-segmented-control>
        <ui-field-description>System follows your device's setting.</ui-field-description>
      </ui-field>
      <ui-field>
        <ui-field-label>Density</ui-field-label>
        <ui-segmented-control name="density" default-value="comfortable">
          <ui-segmented-control-indicator></ui-segmented-control-indicator>
          <ui-segmented-control-item value="compact">Compact</ui-segmented-control-item>
          <ui-segmented-control-item value="comfortable">Comfortable</ui-segmented-control-item>
        </ui-segmented-control>
      </ui-field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">Save</button>
        <button type="reset">Reset</button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const data = new FormData(form)
    log(
      root,
      `Saved theme=${data.get("theme")}, density=${data.get("density")}`
    )
  })
}

export { mount }
