import { confirm } from "@ui-sdk/web/alert-dialog"
import "@ui-sdk/web/overlays"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <button type="button">Archive Project</button>
    <ui-overlay-host></ui-overlay-host>
  `
  root.querySelector("button")!.addEventListener("click", async () => {
    const yes = await confirm({
      title: "Archive this project?",
      description: "It moves to Archived, and you can restore it anytime.",
      confirmLabel: "Archive",
    })
    log(root, yes ? "Archived the project" : "Kept the project")
  })
}

export { mount }
