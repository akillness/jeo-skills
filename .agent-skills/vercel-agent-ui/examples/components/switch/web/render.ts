import "@ui-sdk/web/switch"
import { createElement, Moon, Sun } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <label data-slot="label">
      Dark mode
      <ui-switch>
        <ui-switch-thumb></ui-switch-thumb>
      </ui-switch>
    </label>
  `
  const darkMode = root.querySelector("ui-switch")!
  const thumb = root.querySelector("ui-switch-thumb")!
  const render = (checked: boolean) =>
    thumb.replaceChildren(
      createElement(checked ? Moon : Sun, { "aria-hidden": "true" })
    )
  render(darkMode.checked)
  darkMode.addEventListener("checkedchange", (event) =>
    render(event.detail.value)
  )
}

export { mount }
