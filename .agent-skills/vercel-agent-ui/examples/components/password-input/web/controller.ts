import "@ui-sdk/web/password-input"
import "@ui-sdk/web/field"
import { createElement, Eye, EyeOff } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="suggest">Suggest</button>
        <button type="button" data-action="toggle">Toggle</button>
        <button type="button" data-action="clear">Clear</button>
        <button type="button" data-action="read">Read</button>
        <button type="button" data-action="focus">Focus</button>
      </div>
      <ui-field>
        <ui-field-label>New password</ui-field-label>
        <ui-password-input name="new-password">
          <input autocomplete="new-password" />
          <ui-password-input-toggle>
            <button aria-label="Show password">
              ${createElement(Eye, { "aria-hidden": "true" }).outerHTML}
              ${createElement(EyeOff, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-password-input-toggle>
        </ui-password-input>
      </ui-field>
    </div>
  `
  const password = root.querySelector("ui-password-input")!.api
  const actions: Record<string, () => void> = {
    suggest: () => {
      password.setValue("plum-kettle-orbit-42")
      password.setVisible(true)
    },
    toggle: () => password.toggleVisible(),
    clear: () => password.clear(),
    read: () =>
      log(
        root,
        `${password.getValue().length} characters, ${password.isVisible() ? "shown" : "hidden"}`
      ),
    focus: () => password.focus(),
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => actions[button.dataset.action!]())
    })
}

export { mount }
