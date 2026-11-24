import "@ui-sdk/web/carousel"
import "@ui-sdk/web/select"
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  createElement,
} from "lucide"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]
const alignments = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <ui-select default-value="center">
          <ui-select-label>Align</ui-select-label>
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content hidden>
            ${alignments
              .map(
                (option) => `
                  <ui-select-item value="${option.value}">
                    ${option.label}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
      </div>
      <ui-carousel aria-label="Photos" align="center" default-page="2">
        <div data-slot="row">
          <ui-carousel-previous>
            <button aria-label="Previous slide">${createElement(ChevronLeft, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-carousel-previous>
          <ui-carousel-viewport>
            <ui-carousel-content>
              ${photos.map((photo) => `<ui-carousel-item><div data-slot="tile">${photo.name}</div></ui-carousel-item>`).join("")}
            </ui-carousel-content>
          </ui-carousel-viewport>
          <ui-carousel-next>
            <button aria-label="Next slide">${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-carousel-next>
        </div>
      </ui-carousel>
    </div>
  `
  const carousel = root.querySelector("ui-carousel")!
  root.querySelector("ui-select")!.addEventListener("valuechange", (event) => {
    if (event.detail.value) {
      carousel.setAttribute("align", String(event.detail.value))
    }
  })
}

export { mount }
