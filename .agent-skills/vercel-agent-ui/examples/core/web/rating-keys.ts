import { createParts, wrappedButton } from "@ui-sdk/web"
import { createElement, Star } from "lucide"
import { rating } from "../rating-stages/keys"

createParts(rating, {
  root: "keys-rating",
  star: { tag: "keys-rating-star", target: wrappedButton },
})

const star = createElement(Star, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  const stars = Array.from({ length: 5 }, (_, index) => {
    const label = `${index + 1} ${index === 0 ? "star" : "stars"}`
    return `<keys-rating-star value="${index + 1}"><button aria-label="${label}">${star}</button></keys-rating-star>`
  })
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="rating-readout">
        <output data-slot="rating-value" data-value aria-label="Rating out of 5">3</output>
        <span data-slot="hint">out of 5</span>
      </div>
      <keys-rating aria-label="Rating" default-value="3">${stars.join("")}</keys-rating>
    </div>
  `
  const output = root.querySelector("output")!
  root
    .querySelector("keys-rating")!
    .addEventListener("valuechange", (event) => {
      output.textContent = String(
        (event as CustomEvent<{ value: number }>).detail.value
      )
    })
}

export { mount }
