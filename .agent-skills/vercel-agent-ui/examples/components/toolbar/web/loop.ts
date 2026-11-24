import "@ui-sdk/web/toolbar"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toolbar loop="false" aria-label="Pages">
      ${["First", "Previous", "Next", "Last"]
        .map(
          (label) => `
            <ui-toolbar-button>
              <button>${label}</button>
            </ui-toolbar-button>
          `
        )
        .join("")}
    </ui-toolbar>
  `
  for (const button of root.querySelectorAll("button")) {
    button.addEventListener("click", () =>
      log(root, `${button.textContent} page`)
    )
  }
}

export { mount }
