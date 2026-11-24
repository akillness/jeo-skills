import "@ui-sdk/web/toolbar"
import "@ui-sdk/web/menu"
import { ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toolbar aria-label="Document">
      <ui-toolbar-button>
        <button data-action="save">Save</button>
      </ui-toolbar-button>
      <ui-menu>
        <ui-toolbar-button>
          <ui-menu-trigger>
            <button>
              Share
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-menu-trigger>
        </ui-toolbar-button>
        <ui-menu-content>
          <ui-menu-item value="email">Email</ui-menu-item>
          <ui-menu-item value="link">Copy Link</ui-menu-item>
        </ui-menu-content>
      </ui-menu>
      <ui-toolbar-button>
        <button data-action="print">Print</button>
      </ui-toolbar-button>
    </ui-toolbar>
  `
  root
    .querySelector("[data-action=save]")!
    .addEventListener("click", () => log(root, "Saved"))
  root
    .querySelector("ui-menu")!
    .addEventListener("action", (event) =>
      log(root, `Shared by ${event.detail.value}`)
    )
  root
    .querySelector("[data-action=print]")!
    .addEventListener("click", () => log(root, "Printed"))
}

export { mount }
