import type { UiRatingElement } from "@ui-sdk/web"
import "@ui-sdk/web/rating"
import { createElement, Star } from "lucide"

const star = createElement(Star, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-rating value="4.2" read-only>
      <template><ui-rating-item>${star}</ui-rating-item></template>
    </ui-rating>
  `
  const rating = root.querySelector("ui-rating") as UiRatingElement
  rating.getValueLabel = (value, max) => `Rated ${value} out of ${max}`
}

export { mount }
