import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselViewport,
} from "@ui-sdk/solid/carousel"
import { createSignal, For } from "solid-js"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]

function Example() {
  const [page, setPage] = createSignal(1)
  let strip: HTMLDivElement | undefined
  const show = (next: number) => {
    setPage(next)
    strip
      ?.querySelectorAll("button")
      [next - 1]?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }
  return (
    <div data-slot="stack">
      <Carousel aria-label="Photos" page={page()} onPageChange={show}>
        <CarouselViewport>
          <CarouselContent>
            <For each={photos}>
              {(photo) => (
                <CarouselItem>
                  <div data-slot="tile">{photo.name}</div>
                </CarouselItem>
              )}
            </For>
          </CarouselContent>
        </CarouselViewport>
      </Carousel>
      <Carousel
        ref={strip}
        aria-label="Thumbnails"
        dragFree
        slidesPerPage="auto"
      >
        <CarouselViewport>
          <CarouselContent>
            <For each={photos}>
              {(photo, index) => (
                <CarouselItem aria-label={photo.name}>
                  <button
                    type="button"
                    aria-pressed={page() === index() + 1 ? "true" : "false"}
                    onClick={() => setPage(index() + 1)}
                  >
                    {photo.name}
                  </button>
                </CarouselItem>
              )}
            </For>
          </CarouselContent>
        </CarouselViewport>
      </Carousel>
    </div>
  )
}

export { Example }
