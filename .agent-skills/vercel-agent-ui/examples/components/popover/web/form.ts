import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/popover"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-popover>
      <ui-popover-trigger>
        <button>Edit Profile</button>
      </ui-popover-trigger>
      <ui-popover-content>
        <ui-popover-title>Edit profile</ui-popover-title>
        <ui-popover-description>Your name shows on your posts.</ui-popover-description>
        <form data-slot="stack">
          <ui-field>
            <ui-field-label>Name</ui-field-label>
            <ui-input>
              <input name="name" required value="Hollis Grant" />
            </ui-input>
          </ui-field>
          <div data-slot="row">
            <ui-popover-close>
              <button type="button">Cancel</button>
            </ui-popover-close>
            <button type="submit" data-variant="solid">Save</button>
          </div>
        </form>
      </ui-popover-content>
    </ui-popover>
  `
  const popover = root.querySelector("ui-popover")!
  root.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault()
    log(
      root,
      `Saved ${new FormData(event.target as HTMLFormElement).get("name")}`
    )
    popover.open = false
  })
}

export { mount }
