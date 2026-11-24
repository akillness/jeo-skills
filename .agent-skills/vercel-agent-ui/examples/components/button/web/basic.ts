import "@ui-sdk/web/button"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `<ui-button><button>Button</button></ui-button>`
  root
    .querySelector("ui-button")!
    .addEventListener("action", () => log(root, "Pressed"))
}

export { mount }
