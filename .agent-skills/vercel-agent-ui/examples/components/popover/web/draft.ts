import "@ui-sdk/web/field"
import "@ui-sdk/web/popover"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-popover>
      <ui-popover-trigger>
        <button>Add Note</button>
      </ui-popover-trigger>
      <ui-popover-content>
        <ui-popover-title>Add a note</ui-popover-title>
        <ui-popover-description>Only your team can see it.</ui-popover-description>
        <ui-field>
          <ui-field-label>Note</ui-field-label>
          <textarea placeholder="Call the printer about the proofs."></textarea>
        </ui-field>
        <div data-slot="row" role="alert" hidden>
          Discard your note?
          <div data-slot="row">
            <button type="button" data-size="sm">Keep Editing</button>
            <button type="button" data-size="sm" data-variant="solid">Discard</button>
          </div>
        </div>
        <div data-slot="row">
          <ui-popover-close>
            <button>Cancel</button>
          </ui-popover-close>
          <button type="button" data-variant="solid">Save</button>
        </div>
      </ui-popover-content>
    </ui-popover>
  `
  const popover = root.querySelector("ui-popover")!
  const note = root.querySelector("textarea")!
  const alert = root.querySelector<HTMLElement>('[role="alert"]')!
  const actions = root.querySelector<HTMLElement>(
    'ui-popover-content > [data-slot="row"]:not([role])'
  )!
  const [keep, discard] = alert.querySelectorAll("button")
  const ask = (asking: boolean) => {
    alert.hidden = !asking
    actions.hidden = asking
  }
  const reset = () => {
    ask(false)
    note.value = ""
    popover.removeAttribute("dismissible")
  }
  const close = () => {
    reset()
    popover.open = false
  }
  note.addEventListener("input", () => {
    if (note.value) {
      popover.setAttribute("dismissible", "false")
    } else {
      popover.removeAttribute("dismissible")
    }
  })
  popover.addEventListener("dismissattempt", (event) => {
    log(root, `Kept open (${event.detail.reason})`)
    ask(true)
  })
  keep.addEventListener("click", () => {
    ask(false)
    note.focus()
  })
  discard.addEventListener("click", () => {
    log(root, "Discarded the note")
    close()
  })
  actions
    .querySelector("[data-variant=solid]")!
    .addEventListener("click", () => {
      log(root, note.value ? "Saved the note" : "Nothing to save")
      close()
    })
  popover.addEventListener("openchange", (event) => {
    if (!event.detail.value) {
      reset()
    }
  })
}

export { mount }
