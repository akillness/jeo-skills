import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
  createCarouselController,
} from "@ui-sdk/solid/carousel"
import { For } from "solid-js"

const slides = [1, 2, 3, 4, 5]

function Example() {
  const carousel = createCarouselController()
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <CarouselPrevious controller={carousel} aria-label="Previous slide">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </CarouselPrevious>
        <CarouselNext controller={carousel} aria-label="Next slide">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </CarouselNext>
        <button type="button" onClick={() => carousel.setPage(5)}>
          Show the Last Slide
        </button>
      </div>
      <Carousel aria-label="Featured" controller={carousel} drag={false}>
        <CarouselViewport>
          <CarouselContent>
            <For each={slides}>
              {(slide) => (
                <CarouselItem>
                  <div data-slot="tile">{slide}</div>
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
