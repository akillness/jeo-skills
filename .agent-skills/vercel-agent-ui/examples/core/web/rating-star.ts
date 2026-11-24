import { createParts, wrappedButton } from "@ui-sdk/web"
import { createElement, Star } from "lucide"
import { rating } from "../rating-stages/star"

createParts(rating, {
  root: "first-rating",
  star: { tag: "first-rating-star", target: wrappedButton },
})

const star = createElement(Star, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  const stars = Array.from({ length: 1 }, (_, index) => {
    const label = `${index + 1} ${index === 0 ? "star" : "stars"}`
    return `<first-rating-star value="${index + 1}"><button aria-label="${label}">${star}</button></first-rating-star>`
  })
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="rating-readout">
        <output data-slot="rating-value" data-value aria-label="Rating">0</output>
        <span data-slot="hint">Rating</span>
      </div>
      <first-rating aria-label="Rating">${stars.join("")}</first-rating>
    </div>
  `
  const output = root.querySelector("output")!
  root
    .querySelector("first-rating")!
    .addEventListener("valuechange", (event) => {
      output.textContent = String(
        (event as CustomEvent<{ value: number }>).detail.value
      )
    })
}

export { mount }
