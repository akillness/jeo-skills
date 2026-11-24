import "@ui-sdk/web/carousel"
import { ChevronDown, ChevronUp, createElement } from "lucide"

const slides = [1, 2, 3, 4, 5]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-carousel aria-label="Featured" orientation="vertical">
      <ui-carousel-viewport>
        <ui-carousel-content>
          ${slides.map((slide) => `<ui-carousel-item><div data-slot="tile">${slide}</div></ui-carousel-item>`).join("")}
        </ui-carousel-content>
      </ui-carousel-viewport>
      <div data-slot="row">
        <ui-carousel-previous>
          <button aria-label="Previous slide">${createElement(ChevronUp, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-carousel-previous>
        <ui-carousel-next>
          <button aria-label="Next slide">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-carousel-next>
      </div>
    </ui-carousel>
  `
}

export { mount }
