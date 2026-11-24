import "@ui-sdk/web/menu"
import {
  ChevronRight,
  createElement,
  Download,
  Link,
  Share,
  Trash,
} from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menu presentation="sheet">
      <ui-menu-trigger>
        <button>Options</button>
      </ui-menu-trigger>
      <ui-menu-content>
        <ui-menu-item value="share">
          ${createElement(Share, { "aria-hidden": "true" }).outerHTML}
          Share
        </ui-menu-item>
        <ui-menu-item value="copy-link">
          ${createElement(Link, { "aria-hidden": "true" }).outerHTML}
          Copy link
        </ui-menu-item>
        <ui-menu-sub>
          <ui-menu-sub-trigger>
            ${createElement(Download, { "aria-hidden": "true" }).outerHTML}
            Move to
            ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
          </ui-menu-sub-trigger>
          <ui-menu-sub-content>
            <ui-menu-item value="inbox">Inbox</ui-menu-item>
            <ui-menu-item value="archive">Archive</ui-menu-item>
          </ui-menu-sub-content>
        </ui-menu-sub>
        <ui-menu-separator></ui-menu-separator>
        <ui-menu-item value="delete" destructive>
          ${createElement(Trash, { "aria-hidden": "true" }).outerHTML}
          Delete
        </ui-menu-item>
      </ui-menu-content>
    </ui-menu>
  `
  root
    .querySelector("ui-menu")!
    .addEventListener("action", (event) =>
      log(root, `Chose ${event.detail.value}`)
    )
}

export { mount }
