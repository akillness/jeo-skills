import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/solid/carousel"
import { For } from "solid-js"

const slides = [1, 2, 3, 4, 5]

function Example() {
  return (
    <Carousel aria-label="Featured" orientation="vertical">
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
      <div data-slot="row">
        <CarouselPrevious aria-label="Previous slide">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        </CarouselPrevious>
        <CarouselNext aria-label="Next slide">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </CarouselNext>
      </div>
    </Carousel>
  )
}

export { Example }
