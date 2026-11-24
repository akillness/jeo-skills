import "@ui-sdk/web/field"
import "@ui-sdk/web/rating"
import { createElement, Star } from "lucide"
import { log } from "../../../shared/web/log"

const star = createElement(Star, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field>
        <ui-field-label>Rate your stay</ui-field-label>
        <ui-rating name="stay" required>
          <template><ui-rating-item>${star}</ui-rating-item></template>
        </ui-rating>
      </ui-field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">Send Review</button>
        <button type="reset">Reset</button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Submitted stay=${new FormData(form).get("stay")}`)
  })
}

export { mount }
