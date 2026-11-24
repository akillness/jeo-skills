import "@ui-sdk/web/carousel"

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
          ${photos.map((photo) => `<ui-carousel-item><div data-slot="tile">${photo.name}</div></ui-carousel-item>`).join("")}
        </ui-carousel-content>
      </ui-carousel-viewport>
      <ui-carousel-indicator-group aria-label="Choose a photo">
        ${photos.map((photo) => `<ui-carousel-indicator><button aria-label="${photo.name}"></button></ui-carousel-indicator>`).join("")}
      </ui-carousel-indicator-group>
    </ui-carousel>
  `
}

export { mount }
