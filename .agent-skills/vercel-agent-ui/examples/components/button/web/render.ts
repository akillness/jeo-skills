import "@ui-sdk/web/button"
import { log } from "../../../shared/web/log"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-button><button>Save Changes</button></ui-button>
    </div>
  `
  const save = root.querySelector("ui-button")!
  const button = save.querySelector("button")!
  save.addEventListener("action", (event) => {
    button.textContent = "Saving…"
    const saving = wait(1000).then(() => {
      log(root, "Couldn't save. Check your connection and try again.")
      throw new Error("Couldn't save")
    })
    event.detail.waitUntil(saving)
    saving.catch(() => {
      button.textContent = "Try Again"
    })
  })
}

export { mount }
