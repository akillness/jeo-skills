import "@ui-sdk/web/switch"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field-set>
        <fieldset>
          <legend>Email notifications</legend>
          <label data-slot="label">
            Product updates
            <ui-switch name="updates">
              <ui-switch-thumb></ui-switch-thumb>
            </ui-switch>
          </label>
          <label data-slot="label">
            Security alerts
            <ui-switch name="security" default-checked>
              <ui-switch-thumb></ui-switch-thumb>
            </ui-switch>
          </label>
          <label data-slot="label">
            Weekly digest
            <ui-switch name="digest" value="weekly" default-checked>
              <ui-switch-thumb></ui-switch-thumb>
            </ui-switch>
          </label>
        </fieldset>
      </ui-field-set>
      <div data-slot="row">
        <button type="submit" data-variant="solid">Save</button>
        <button type="reset">Reset</button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const entries = [...new FormData(form)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(
      root,
      entries.length ? `Submitted ${entries.join("&")}` : "Submitted nothing"
    )
  })
}

export { mount }
