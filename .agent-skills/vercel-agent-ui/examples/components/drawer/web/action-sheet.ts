import "@ui-sdk/web/drawer"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      <button type="button">Photo Options</button>
      <ui-drawer>
        <ui-drawer-backdrop hidden></ui-drawer-backdrop>
        <ui-drawer-content hidden>
          <div data-slot="stack">
            <ui-drawer-title>Beach.jpg</ui-drawer-title>
            <ui-drawer-description>Taken today at 9:41.</ui-drawer-description>
          </div>
          <div data-slot="stack">
            <ui-drawer-close value="share"><button>Share</button></ui-drawer-close>
            <ui-drawer-close value="duplicate"><button>Duplicate</button></ui-drawer-close>
            <ui-drawer-close value="delete"><button>Delete</button></ui-drawer-close>
            <ui-drawer-close value="cancel"><button>Cancel</button></ui-drawer-close>
          </div>
        </ui-drawer-content>
      </ui-drawer>
    </div>
  `
  const drawer = root.querySelector("ui-drawer")!
  root.querySelector("button")!.addEventListener("click", async () => {
    const { returnValue = "cancel" } = await drawer.api.open()
    log(root, returnValue === "cancel" ? "Canceled" : `Chose ${returnValue}`)
  })
}

export { mount }
