import "@ui-sdk/web/dialog"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-dialog>
      <ui-dialog-trigger>
        <button>Write a Post</button>
      </ui-dialog-trigger>
      <ui-dialog-backdrop hidden></ui-dialog-backdrop>
      <ui-dialog-content hidden>
        <div data-slot="stack">
          <ui-dialog-title>New post</ui-dialog-title>
          <ui-dialog-description>Share an update with your team.</ui-dialog-description>
        </div>
        <ui-field>
          <ui-field-label>Post</ui-field-label>
          <textarea placeholder="What's new?"></textarea>
        </ui-field>
        <div data-slot="row" role="alert" hidden>
          Discard your changes?
          <div data-slot="row">
            <button type="button">Keep Editing</button>
            <button data-variant="solid" type="button">Discard</button>
          </div>
        </div>
        <div data-slot="row">
          <ui-dialog-close value="post">
            <button data-variant="solid">Post</button>
          </ui-dialog-close>
        </div>
      </ui-dialog-content>
    </ui-dialog>
  `
  const dialog = root.querySelector("ui-dialog")!
  const post = root.querySelector("textarea")!
  const alert = root.querySelector<HTMLElement>('[role="alert"]')!
  const actions = root.querySelector<HTMLElement>(
    'ui-dialog-content > [data-slot="row"]:not([role])'
  )!
  const [keep, discard] = alert.querySelectorAll("button")
  const ask = (asking: boolean) => {
    alert.hidden = !asking
    actions.hidden = asking
  }
  post.addEventListener("input", () => {
    if (post.value) {
      dialog.setAttribute("dismissible", "false")
    } else {
      dialog.removeAttribute("dismissible")
    }
  })
  dialog.addEventListener("dismissattempt", () => ask(true))
  keep.addEventListener("click", () => {
    ask(false)
    post.focus()
  })
  discard.addEventListener("click", () => (dialog.open = false))
  dialog.addEventListener("openchange", (event) => {
    if (event.detail.value) {
      return
    }
    ask(false)
    post.value = ""
    dialog.removeAttribute("dismissible")
  })
}

export { mount }
