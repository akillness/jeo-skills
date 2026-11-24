import "@ui-sdk/web/toolbar"
import { Check, createElement, MessageSquare } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toolbar aria-label="Pull request">
      <ui-toolbar-button>
        <button aria-label="Approve">
          ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-toolbar-button>
      <ui-toolbar-button>
        <button aria-label="Comment">
          ${createElement(MessageSquare, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-toolbar-button>
      <ui-toolbar-separator></ui-toolbar-separator>
      <ui-toolbar-link>
        <a href="#files">Files Changed</a>
      </ui-toolbar-link>
      <ui-toolbar-link>
        <a href="#checks">Checks</a>
      </ui-toolbar-link>
    </ui-toolbar>
  `
  root
    .querySelector('[aria-label="Approve"]')!
    .addEventListener("click", () => log(root, "Approved"))
  root
    .querySelector('[aria-label="Comment"]')!
    .addEventListener("click", () => log(root, "Comment"))
  for (const link of root.querySelectorAll("a")) {
    link.addEventListener("click", (event) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      event.preventDefault()
      log(root, `Opened ${link.textContent}`)
    })
  }
}

export { mount }
