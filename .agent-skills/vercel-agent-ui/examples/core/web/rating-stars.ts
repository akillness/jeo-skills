import { createParts, wrappedButton } from "@ui-sdk/web"
import { createElement, Star } from "lucide"
import { rating } from "../rating-stages/star"

createParts(rating, {
  root: "stars-rating",
  star: { tag: "stars-rating-star", target: wrappedButton },
})

const star = createElement(Star, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  const stars = Array.from({ length: 5 }, (_, index) => {
    const label = `${index + 1} ${index === 0 ? "star" : "stars"}`
    return `<stars-rating-star value="${index + 1}"><button aria-label="${label}">${star}</button></stars-rating-star>`
  })
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="rating-readout">
        <output data-slot="rating-value" data-value aria-label="Rating out of 5">0</output>
        <span data-slot="hint">out of 5</span>
      </div>
      <stars-rating aria-label="Rating">${stars.join("")}</stars-rating>
    </div>
  `
  const output = root.querySelector("output")!
  root
    .querySelector("stars-rating")!
    .addEventListener("valuechange", (event) => {
      output.textContent = String(
        (event as CustomEvent<{ value: number }>).detail.value
      )
    })
}

export { mount }
