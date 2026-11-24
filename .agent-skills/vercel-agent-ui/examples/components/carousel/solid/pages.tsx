import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/solid/carousel"
import { For } from "solid-js"

const products = [1, 2, 3, 4, 5, 6, 7, 8]

function Example() {
  return (
    <Carousel aria-label="Products" slidesPerPage={3}>
      <div data-slot="row">
        <CarouselPrevious aria-label="Previous page">
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
            <For each={products}>
              {(product) => (
                <CarouselItem>
                  <div data-slot="tile">{product}</div>
                </CarouselItem>
              )}
            </For>
          </CarouselContent>
        </CarouselViewport>
        <CarouselNext aria-label="Next page">
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
        <CarouselIndicatorGroup aria-label="Choose a page">
          {(state) =>
            Array.from({ length: state.pageCount ?? 3 }, (_, index) => (
              <CarouselIndicator
                page={index + 1}
                aria-label={`Page ${index + 1}`}
              />
            ))
          }
        </CarouselIndicatorGroup>
      </div>
    </Carousel>
  )
}

export { Example }
