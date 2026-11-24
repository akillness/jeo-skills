import type { ColorSchemeValue } from "@ui-sdk/core"
import "@ui-sdk/web/preferences"
import "@ui-sdk/web/segmented-control"
import { colorScheme } from "../color-scheme"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-preferences>
      <div data-slot="appearance">
        <div data-slot="appearance-text">
          <p data-slot="appearance-title">Appearance</p>
          <p data-slot="appearance-description">
            Pick a color scheme, or follow your system.
          </p>
        </div>
        <ui-segmented-control aria-label="Color scheme">
          <ui-segmented-control-indicator></ui-segmented-control-indicator>
          <ui-segmented-control-item value="light">Light</ui-segmented-control-item>
          <ui-segmented-control-item value="dark">Dark</ui-segmented-control-item>
          <ui-segmented-control-item value="system">System</ui-segmented-control-item>
        </ui-segmented-control>
      </div>
    </ui-preferences>
  `
  root.querySelector("ui-preferences")!.preferences = [colorScheme]
  const control = root.querySelector("ui-segmented-control")!
  control.addEventListener("valuechange", (event) => {
    colorScheme.set(event.detail.value as ColorSchemeValue)
  })
  const show = () => (control.value = colorScheme.get().value)
  show()
  return colorScheme.subscribe(show)
}

export { mount }
