import "@ui-sdk/web/rating"
import { createElement, Star } from "lucide"

const star = createElement(Star, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-rating aria-label="Rating" step="0.5" default-value="3.5">
      <template><ui-rating-item>${star}</ui-rating-item></template>
    </ui-rating>
  `
}

export { mount }
