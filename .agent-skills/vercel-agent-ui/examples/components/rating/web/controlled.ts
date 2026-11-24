import "@ui-sdk/web/rating"
import { createElement, Star } from "lucide"
import { log } from "../../../shared/web/log"

const star = createElement(Star, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div>
      <div data-slot="controls">
        <button type="button">Clear Rating</button>
      </div>
      <ui-rating aria-label="Rating" default-value="4">
        <template><ui-rating-item>${star}</ui-rating-item></template>
      </ui-rating>
    </div>
  `
  const rating = root.querySelector("ui-rating")!
  rating.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    log(root, `value: ${value} (${reason})`)
  })
  root
    .querySelector('[data-slot="controls"] button')!
    .addEventListener("click", () => rating.api.setValue(null))
}

export { mount }
