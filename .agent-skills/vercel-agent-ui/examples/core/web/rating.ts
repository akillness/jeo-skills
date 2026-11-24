import { createParts, wrappedButton } from "@ui-sdk/web"
import { createElement, Star } from "lucide"
import { rating } from "../rating-stages/keyboard"

createParts(rating, {
  root: "my-rating",
  star: { tag: "my-rating-star", target: wrappedButton },
})

const star = createElement(Star, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  const stars = Array.from({ length: 5 }, (_, index) => {
    const label = `${index + 1} ${index === 0 ? "star" : "stars"}`
    return `<my-rating-star value="${index + 1}"><button aria-label="${label}">${star}</button></my-rating-star>`
  })
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="rating-readout">
        <output data-slot="rating-value" data-value aria-label="Rating out of 5">3</output>
        <span data-slot="hint">out of 5</span>
      </div>
      <my-rating aria-label="Rating" default-value="3">${stars.join("")}</my-rating>
    </div>
  `
  const output = root.querySelector("output")!
  root.querySelector("my-rating")!.addEventListener("valuechange", (event) => {
    output.textContent = String(
      (event as CustomEvent<{ value: number }>).detail.value
    )
  })
}

export { mount }
