import "@ui-sdk/web/command"
import { createElement, LoaderCircle } from "lucide"
import { log } from "../../../shared/web/log"

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

function mount(root: HTMLElement) {
  const spinner = createElement(LoaderCircle, {
    "data-slot": "spinner",
    "aria-hidden": "true",
  }).outerHTML
  root.innerHTML = `
    <div data-slot="stack">
      <ui-command>
        <ui-command-input>
          <input aria-label="Search actions" placeholder="Search actions…" />
        </ui-command-input>
        <ui-command-list>
          <ui-command-item value="deploy" label="Deploy to production">
            Deploy to production
            ${spinner}
          </ui-command-item>
          <ui-command-item value="sync" label="Sync with server">
            Sync with server
            ${spinner}
            <span data-slot="hint" data-error hidden>Failed, try again</span>
          </ui-command-item>
        </ui-command-list>
      </ui-command>
    </div>
  `
  const error = root.querySelector<HTMLElement>("[data-error]")!
  root.querySelector("ui-command")!.addEventListener("action", (event) => {
    const { value, waitUntil } = event.detail
    if (value === "deploy") {
      waitUntil(wait(1200).then(() => log(root, "Deployed to production")))
    }
    if (value === "sync") {
      error.hidden = true
      const sync = wait(600).then(() => {
        log(root, "Couldn't sync: offline")
        throw new Error("Offline")
      })
      waitUntil(sync)
      sync.catch(() => (error.hidden = false))
    }
  })
}

export { mount }
