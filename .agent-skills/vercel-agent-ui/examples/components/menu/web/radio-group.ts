import "@ui-sdk/web/menu"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menu>
      <ui-menu-trigger>
        <button>Panel</button>
      </ui-menu-trigger>
      <ui-menu-content>
        <ui-menu-radio-group name="position" default-value="bottom">
          <ui-menu-group-label>Position</ui-menu-group-label>
          ${["Top", "Bottom", "Right"]
            .map(
              (option) => `
                <ui-menu-radio-item value="${option.toLowerCase()}">
                  <ui-menu-item-indicator></ui-menu-item-indicator>
                  ${option}
                </ui-menu-radio-item>
              `
            )
            .join("")}
        </ui-menu-radio-group>
        <ui-menu-separator></ui-menu-separator>
        <ui-menu-radio-group default-value="comfortable">
          <ui-menu-group-label>Density</ui-menu-group-label>
          ${["Compact", "Comfortable"]
            .map(
              (option) => `
                <ui-menu-radio-item value="${option.toLowerCase()}">
                  <ui-menu-item-indicator></ui-menu-item-indicator>
                  ${option}
                </ui-menu-radio-item>
              `
            )
            .join("")}
        </ui-menu-radio-group>
      </ui-menu-content>
    </ui-menu>
  `
  const [position, density] = root.querySelectorAll("ui-menu-radio-group")
  position.addEventListener("valuechange", (event) =>
    log(root, `Panel at the ${event.detail.value}`)
  )
  density.addEventListener("valuechange", (event) =>
    log(root, `${event.detail.value} density`)
  )
}

export { mount }
