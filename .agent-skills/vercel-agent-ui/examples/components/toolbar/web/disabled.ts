import "@ui-sdk/web/toolbar"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toolbar aria-label="Message">
      <ui-toolbar-button>
        <button>Reply</button>
      </ui-toolbar-button>
      <ui-toolbar-button disabled>
        <button>Archive</button>
      </ui-toolbar-button>
      <ui-toolbar-button disabled focusable-when-disabled="false">
        <button>Delete</button>
      </ui-toolbar-button>
    </ui-toolbar>
  `
  for (const button of root.querySelectorAll("button")) {
    button.addEventListener("click", () => log(root, button.textContent!))
  }
}

export { mount }
