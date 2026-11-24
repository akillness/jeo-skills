import "@ui-sdk/web/popover"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-popover>
      <ui-popover-trigger>
        <button>What's New</button>
      </ui-popover-trigger>
      <ui-popover-content keep-mounted>
        <ui-popover-title>What's new</ui-popover-title>
        <ui-popover-description>Comments now support threads and reactions.</ui-popover-description>
        <div data-slot="row">
          <ui-popover-close>
            <button data-variant="solid">Got It</button>
          </ui-popover-close>
        </div>
      </ui-popover-content>
    </ui-popover>
  `
  const popover = root.querySelector("ui-popover")!
  popover.addEventListener("openchange", (event) =>
    log(root, event.detail.value ? "Opening" : "Closing")
  )
  popover.addEventListener("openchangecomplete", (event) =>
    log(root, event.detail.value ? "Open" : "Closed")
  )
}

export { mount }
