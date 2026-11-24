import "@ui-sdk/web/carousel"
import { ChevronLeft, ChevronRight, createElement } from "lucide"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-carousel aria-label="Photos">
      <ui-carousel-viewport>
        <ui-carousel-content>
          ${photos.map((photo, index) => `<ui-carousel-item><div data-slot="tile">${photo.name}<span data-slot="hint">${index + 1} / ${photos.length}<span hidden> · showing</span></span></div></ui-carousel-item>`).join("")}
        </ui-carousel-content>
      </ui-carousel-viewport>
      <div data-slot="row">
        <ui-carousel-previous>
          <button>${createElement(ChevronLeft, { "aria-hidden": "true" }).outerHTML} Previous</button>
        </ui-carousel-previous>
        <ui-carousel-next>
          <button>Next ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-carousel-next>
        <a href="https://example.com/gallery" hidden>See all photos</a>
      </div>
    </ui-carousel>
  `
  const carousel = root.querySelector("ui-carousel")!
  const next = root.querySelector<HTMLElement>("ui-carousel-next button")!
  const link = root.querySelector("a")!
  const update = () => {
    for (const item of carousel.querySelectorAll("ui-carousel-item")) {
      item.querySelector<HTMLElement>("[data-slot='hint'] > span")!.hidden =
        !item.hasAttribute("data-active")
    }
    const end = next.hasAttribute("data-disabled")
    const focused = document.activeElement === next
    link.hidden = !end
    if (end && focused) {
      link.focus()
    }
    next.hidden = end
  }
  new MutationObserver(update).observe(carousel, {
    subtree: true,
    attributeFilter: ["data-active", "data-disabled"],
  })
  update()
}

export { mount }
