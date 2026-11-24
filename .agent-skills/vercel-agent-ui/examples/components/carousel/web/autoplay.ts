import "@ui-sdk/web/carousel"
import { ChevronLeft, ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

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
    <ui-carousel aria-label="Photos" default-playing interval="4000">
      <div data-slot="controls">
        <ui-carousel-play-toggle>
          <button><span data-show="playing">Pause</span><span data-show="stopped">Play</span></button>
        </ui-carousel-play-toggle>
      </div>
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
  `
  root
    .querySelector("ui-carousel")!
    .addEventListener("playingchange", (event) => {
      log(
        root,
        `${event.detail.value ? "Playing" : "Stopped"} (${event.detail.reason})`
      )
    })
}

export { mount }
