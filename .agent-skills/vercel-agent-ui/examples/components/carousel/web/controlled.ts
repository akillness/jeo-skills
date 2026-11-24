import "@ui-sdk/web/carousel"
import { ChevronLeft, ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const slides = [1, 2, 3, 4, 5]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-carousel aria-label="Featured">
      <div data-slot="row">
        <ui-carousel-previous>
          <button aria-label="Previous slide">${createElement(ChevronLeft, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-carousel-previous>
        <ui-carousel-viewport>
          <ui-carousel-content>
            ${slides.map((slide) => `<ui-carousel-item><div data-slot="tile">${slide}</div></ui-carousel-item>`).join("")}
          </ui-carousel-content>
        </ui-carousel-viewport>
        <ui-carousel-next>
          <button aria-label="Next slide">${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-carousel-next>
      </div>
    </ui-carousel>
  `
  root.querySelector("ui-carousel")!.addEventListener("pagechange", (event) => {
    log(root, `Page ${event.detail.value} (${event.detail.reason})`)
  })
}

export { mount }
