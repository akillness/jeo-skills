import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/solid/carousel"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const slides = [1, 2, 3, 4, 5]

function Example() {
  const log = useLog()
  return (
    <Carousel
      aria-label="Featured"
      onPageChangeComplete={(page) => log(`Rested on slide ${page}`)}
    >
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
            <path d="m15 18-6-6 6-6" />
          </svg>
        </CarouselPrevious>
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
            <path d="m9 18 6-6-6-6" />
          </svg>
        </CarouselNext>
      </div>
      <div data-slot="row">
        <div data-slot="bar">
          <div />
        </div>
      </div>
    </Carousel>
  )
}

export { Example }
