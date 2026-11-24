import "@ui-sdk/web/carousel"
import { ChevronLeft, ChevronRight, createElement } from "lucide"

const slides = [1, 2, 3, 4, 5]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-carousel aria-label="مميز">
        <ui-carousel-viewport>
          <ui-carousel-content>
            ${slides.map((slide) => `<ui-carousel-item><div data-slot="tile">${slide}</div></ui-carousel-item>`).join("")}
          </ui-carousel-content>
        </ui-carousel-viewport>
        <div data-slot="row">
          <ui-carousel-previous>
            <button aria-label="الشريحة السابقة">${createElement(ChevronLeft, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-carousel-previous>
          <ui-carousel-indicator-group aria-label="اختر شريحة">
            ${slides.map((slide) => `<ui-carousel-indicator><button aria-label="الشريحة ${slide}"></button></ui-carousel-indicator>`).join("")}
          </ui-carousel-indicator-group>
          <ui-carousel-next>
            <button aria-label="الشريحة التالية">${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-carousel-next>
        </div>
      </ui-carousel>
    </div>
  `
}

export { mount }
