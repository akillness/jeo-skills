import "@ui-sdk/web/progress"
import { log } from "../../../shared/web/log"

const total = 5

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Upload Next</button>
        <button type="button">Reset</button>
      </div>
      <ui-progress>
        <ui-progress-label>Uploading photos</ui-progress-label>
        <ui-progress-value></ui-progress-value>
        <ui-progress-track>
          <ui-progress-indicator></ui-progress-indicator>
        </ui-progress-track>
      </ui-progress>
    </div>
  `
  const progress = root.querySelector("ui-progress")!
  const [next, reset] = root.querySelectorAll("button")
  let uploaded = 1
  const show = () => {
    progress.setAttribute("value", String((uploaded / total) * 100))
    next.setAttribute("aria-disabled", String(uploaded >= total))
  }
  next.addEventListener("click", () => {
    if (uploaded >= total) {
      return
    }
    uploaded++
    show()
    log(root, `Uploaded ${uploaded} of ${total} photos`)
  })
  reset.addEventListener("click", () => {
    uploaded = 0
    show()
    log(root, "Reset to 0 photos")
  })
  show()
}

export { mount }
