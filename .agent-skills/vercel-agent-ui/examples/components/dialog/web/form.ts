import "@ui-sdk/web/dialog"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-dialog>
      <ui-dialog-trigger>
        <button>New Article</button>
      </ui-dialog-trigger>
      <ui-dialog-backdrop hidden></ui-dialog-backdrop>
      <ui-dialog-content hidden>
        <div data-slot="stack">
          <ui-dialog-title>New article</ui-dialog-title>
          <ui-dialog-description>Save it as a draft or publish it now.</ui-dialog-description>
        </div>
        <form data-slot="stack" method="dialog">
          <ui-field>
            <ui-field-label>Title</ui-field-label>
            <ui-input>
              <input required value="Shipping updates for spring" />
            </ui-input>
          </ui-field>
          <div data-slot="row">
            <button type="submit" value="draft">Save Draft</button>
            <button data-variant="solid" type="submit" value="published">Publish</button>
          </div>
        </form>
      </ui-dialog-content>
    </ui-dialog>
  `
  root.querySelector("ui-dialog")!.addEventListener("openchange", (event) => {
    const { value, reason, returnValue } = event.detail
    if (!value) {
      log(root, returnValue ? `Saved as ${returnValue}` : `Closed (${reason})`)
    }
  })
}

export { mount }
