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
    <div data-slot="stack">
      <ui-carousel aria-label="Photos">
        <ui-carousel-viewport>
          <ui-carousel-content>
            ${photos.map((photo) => `<ui-carousel-item><div data-slot="tile">${photo.name}</div></ui-carousel-item>`).join("")}
          </ui-carousel-content>
        </ui-carousel-viewport>
      </ui-carousel>
      <ui-carousel aria-label="Thumbnails" drag-free slides-per-page="auto">
        <ui-carousel-viewport>
          <ui-carousel-content>
            ${photos.map((photo, index) => `<ui-carousel-item aria-label="${photo.name}"><button type="button" data-page="${index + 1}" aria-pressed="${index === 0}">${photo.name}</button></ui-carousel-item>`).join("")}
          </ui-carousel-content>
        </ui-carousel-viewport>
      </ui-carousel>
    </div>
  `
  const gallery = root.querySelector("ui-carousel")!
  const thumbnails = [
    ...root.querySelectorAll<HTMLButtonElement>("button[data-page]"),
  ]
  const show = (page: number) => {
    for (const thumbnail of thumbnails) {
      thumbnail.setAttribute(
        "aria-pressed",
        String(thumbnail.dataset.page === String(page))
      )
    }
    thumbnails[page - 1]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    })
  }
  for (const thumbnail of thumbnails) {
    thumbnail.addEventListener(
      "click",
      () => (gallery.page = Number(thumbnail.dataset.page))
    )
  }
  gallery.addEventListener("pagechange", (event) => show(event.detail.value))
}

export { mount }
